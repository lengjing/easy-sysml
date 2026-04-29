import type { ChildProcess } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { isAbsolute, resolve } from 'node:path'
import type { WebSocket } from 'ws'
import type { SessionInfo, SessionState } from './types.js'

type SpawnedProcess = ChildProcess & {
  stderr: NodeJS.ReadableStream | null
  stdin: NodeJS.WritableStream | null
  stdout: NodeJS.ReadableStream | null
}

export type CreateSessionOptions = {
  allowedTools?: string[]
  dangerouslySkipPermissions?: boolean
  maxTurns?: number
  mcpConfig?: string[]
  model?: string
  prompt?: string
  systemPrompt?: string
  workDir: string
}

export interface SessionBackend {
  createSession(options: CreateSessionOptions): ChildProcess
}

export interface ServerSession extends SessionInfo {
  _authToken: string
  _idleTimer: ReturnType<typeof setTimeout> | null
  _sockets: Set<WebSocket>
  _stdoutBuf: string
}

export class SessionManager {
  private sessions = new Map<string, ServerSession>()

  constructor(
    private readonly backend: SessionBackend,
    private readonly options: {
      idleTimeoutMs?: number
      maxSessions?: number
    } = {},
  ) {}

  create(opts: {
    allowedTools?: string[]
    authToken?: string
    cwd?: string
    dangerouslySkipPermissions?: boolean
    maxTurns?: number
    mcpConfig?: string[]
    model?: string
    prompt?: string
    systemPrompt?: string
    workspace?: string
  }): ServerSession {
    if (this.options.maxSessions && this.sessions.size >= this.options.maxSessions) {
      throw new Error(
        `Maximum number of concurrent sessions (${this.options.maxSessions}) reached`,
      )
    }

    const workDir = opts.cwd
      ? isAbsolute(opts.cwd)
        ? opts.cwd
        : resolve(process.cwd(), opts.cwd)
      : opts.workspace ?? process.cwd()

    if (!existsSync(workDir)) {
      throw new Error(`Working directory does not exist: ${workDir}`)
    }

    const processHandle = this.backend.createSession({
      allowedTools: opts.allowedTools,
      dangerouslySkipPermissions: opts.dangerouslySkipPermissions,
      maxTurns: opts.maxTurns,
      mcpConfig: opts.mcpConfig,
      model: opts.model,
      prompt: opts.prompt,
      systemPrompt: opts.systemPrompt,
      workDir,
    }) as SpawnedProcess

    const session: ServerSession = {
      id: randomUUID(),
      status: 'starting' as SessionState,
      createdAt: Date.now(),
      workDir,
      process: processHandle,
      _authToken: opts.authToken ?? '',
      _idleTimer: null,
      _sockets: new Set(),
      _stdoutBuf: '',
    }

    this.sessions.set(session.id, session)
    this.attachProcessHandlers(session)
    return session
  }

  get(id: string): ServerSession | undefined {
    return this.sessions.get(id)
  }

  list(): SessionInfo[] {
    return Array.from(this.sessions.values()).map(session => ({
      id: session.id,
      status: session.status,
      createdAt: session.createdAt,
      workDir: session.workDir,
      process: null,
      sessionKey: session.sessionKey,
    }))
  }

  attachSocket(id: string, socket: WebSocket): ServerSession | undefined {
    const session = this.sessions.get(id)
    if (!session) {
      return undefined
    }

    this.clearIdleTimer(session)
    session._sockets.add(socket)
    if (session.status === 'detached') {
      session.status = 'running'
    }
    return session
  }

  detachSocket(id: string, socket: WebSocket): void {
    const session = this.sessions.get(id)
    if (!session) {
      return
    }

    session._sockets.delete(socket)
    if (session._sockets.size === 0 && session.status === 'running') {
      session.status = 'detached'
      this.scheduleIdleTimeout(session)
    }
  }

  stop(id: string): boolean {
    const session = this.sessions.get(id)
    if (!session) {
      return false
    }

    this.clearIdleTimer(session)
    session.status = 'stopping'
    try {
      ;(session.process as SpawnedProcess).kill('SIGTERM')
    } catch {
      // Ignore process termination races during shutdown.
    }
    this.sessions.delete(id)
    return true
  }

  async destroyAll(): Promise<void> {
    for (const id of Array.from(this.sessions.keys())) {
      this.stop(id)
    }
  }

  get size(): number {
    return this.sessions.size
  }

  private attachProcessHandlers(session: ServerSession): void {
    const processHandle = session.process as SpawnedProcess

    processHandle.stdout?.on('data', chunk => {
      session.status = session._sockets.size > 0 ? 'running' : 'detached'
      session._stdoutBuf += chunk.toString()
      const lines = session._stdoutBuf.split('\n')
      session._stdoutBuf = lines.pop() ?? ''

      for (const line of lines) {
        if (!line.trim()) {
          continue
        }
        for (const socket of session._sockets) {
          if (socket.readyState === 1) {
            socket.send(line)
          }
        }
      }
    })

    processHandle.stderr?.on('data', chunk => {
      const message = JSON.stringify({
        type: 'server_error',
        content: chunk.toString(),
      })
      for (const socket of session._sockets) {
        if (socket.readyState === 1) {
          socket.send(message)
        }
      }
    })

    processHandle.on('exit', code => {
      this.clearIdleTimer(session)
      session.status = 'stopped'

      if (session._stdoutBuf.trim()) {
        for (const socket of session._sockets) {
          if (socket.readyState === 1) {
            socket.send(session._stdoutBuf)
          }
        }
        session._stdoutBuf = ''
      }

      const doneMessage = JSON.stringify({
        type: 'server_session_done',
        exit_code: code,
      })
      for (const socket of session._sockets) {
        if (socket.readyState === 1) {
          socket.send(doneMessage)
          socket.close()
        }
      }
      session._sockets.clear()

      setTimeout(() => {
        this.sessions.delete(session.id)
      }, 30_000)
    })
  }

  private scheduleIdleTimeout(session: ServerSession): void {
    this.clearIdleTimer(session)
    if (!this.options.idleTimeoutMs || this.options.idleTimeoutMs <= 0) {
      return
    }

    session._idleTimer = setTimeout(() => {
      this.stop(session.id)
    }, this.options.idleTimeoutMs)
  }

  private clearIdleTimer(session: ServerSession): void {
    if (session._idleTimer) {
      clearTimeout(session._idleTimer)
      session._idleTimer = null
    }
  }
}