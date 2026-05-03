import type { ChildProcess } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { isAbsolute, resolve } from 'node:path'
import type { WebSocket } from 'ws'
import {
  listSessionsImpl,
  type ListSessionsOptions,
  type SessionInfo as ListedSessionInfo,
} from '../utils/listSessionsImpl.js'
import type { SessionInfo, SessionState } from './types.js'

/**
 * Session metadata returned by {@link SessionManager.list}, sourced from the
 * Claude filesystem storage (`~/.claude/projects/`). This is distinct from the
 * internal `SessionInfo` type (from `./types.js`) which tracks in-memory
 * runtime session state (process handles, sockets, etc.).
 */
export type { ListedSessionInfo }

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

  /**
   * Spawns a new Claude subprocess and returns a session keyed by the
   * subprocess's own session ID (extracted from its `system/init` stdout
   * message). This ensures the ID returned from `POST /sessions` matches
   * the IDs returned by `list()` — both sourced from the same Claude
   * session UUID that is written to `~/.claude/projects/`.
   *
   * Falls back to a random UUID when the subprocess does not emit a
   * `session_id` field on its first stdout line (e.g. test backends).
   */
  async create(opts: {
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
  }): Promise<ServerSession> {
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

    // Wait for the subprocess's first stdout line to extract the Claude session
    // ID from the `system/init` message. All data read here is stored in
    // `buffered` and pre-seeded into `_stdoutBuf` so attachProcessHandlers
    // can relay it without losing any messages.
    const { id, buffered } = await this.extractClaudeSessionId(processHandle)

    const session: ServerSession = {
      id,
      status: 'starting' as SessionState,
      createdAt: Date.now(),
      workDir,
      process: processHandle,
      _authToken: opts.authToken ?? '',
      _idleTimer: null,
      _sockets: new Set(),
      _stdoutBuf: buffered,
    }

    this.sessions.set(session.id, session)
    this.attachProcessHandlers(session)
    return session
  }

  get(id: string): ServerSession | undefined {
    return this.sessions.get(id)
  }

  async list(opts?: ListSessionsOptions): Promise<ListedSessionInfo[]> {
    return listSessionsImpl(opts)
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

  /**
   * Reads the subprocess's first stdout line to extract the Claude session ID
   * from its `system/init` message. Returns the session ID and all stdout data
   * buffered so far — to be pre-seeded into `_stdoutBuf` so the relay handler
   * doesn't miss messages written before it was registered.
   *
   * Falls back to a random UUID if:
   * - The first line does not contain a `session_id` field
   * - No newline arrives within 5 seconds
   * - The process closes before emitting any output
   */
  private extractClaudeSessionId(
    proc: SpawnedProcess,
  ): Promise<{ id: string; buffered: string }> {
    return new Promise(resolve => {
      let buf = ''
      let done = false

      const finish = (id: string) => {
        if (done) return
        done = true
        clearTimeout(timer)
        proc.stdout?.off('data', onData)
        proc.off('close', onClose)
        resolve({ id, buffered: buf })
      }

      const onData = (chunk: Buffer | string) => {
        buf += typeof chunk === 'string' ? chunk : chunk.toString()
        const nl = buf.indexOf('\n')
        if (nl < 0) return

        const line = buf.slice(0, nl)
        try {
          const msg = JSON.parse(line) as Record<string, unknown>
          if (typeof msg.session_id === 'string' && msg.session_id) {
            finish(msg.session_id)
            return
          }
        } catch {
          // Non-JSON first line — fall through to random UUID.
        }
        finish(randomUUID())
      }

      const onClose = () => finish(randomUUID())

      // 5-second safety timeout. Real Claude init messages arrive almost
      // instantly; this guards against stalled or non-conformant backends.
      const timer = setTimeout(() => finish(randomUUID()), 5_000)

      proc.stdout?.on('data', onData)
      proc.once('close', onClose)
    })
  }

  private attachProcessHandlers(session: ServerSession): void {
    const processHandle = session.process as SpawnedProcess

    // Drain any data buffered during session ID extraction before registering
    // the live relay handler, so no messages are dropped.
    this.drainBuf(session)

    processHandle.stdout?.on('data', chunk => {
      session._stdoutBuf += chunk.toString()
      this.drainBuf(session)
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

  /**
   * Flush all complete (newline-terminated) lines from `session._stdoutBuf`
   * to connected sockets. Called both when new data chunks arrive and when
   * the pre-buffered init data is first drained by `attachProcessHandlers`.
   */
  private drainBuf(session: ServerSession): void {
    session.status = session._sockets.size > 0 ? 'running' : 'detached'
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