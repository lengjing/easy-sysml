import { afterEach, describe, expect, test } from 'bun:test'
import { randomUUID } from 'crypto'
import { mkdir, mkdtemp } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { EventEmitter } from 'events'
import { PassThrough } from 'stream'
import { startServer } from './server.js'
import { SessionManager } from './sessionManager.js'
import type { ServerSessionProcess } from './backends/dangerousBackend.js'
import type { ServerConfig } from './types.js'
import { listSessionsImpl } from '../utils/listSessionsImpl.js'

type SessionBackendLike = ConstructorParameters<typeof SessionManager>[0]

class DeterministicSessionProcess
  extends EventEmitter
  implements ServerSessionProcess
{
  readonly stdout = new PassThrough()
  readonly stderr = new PassThrough()
  readonly stdin: { write: (chunk: string) => boolean }

  private closed = false

  constructor(private readonly sessionId: string) {
    super()

    this.stdin = {
      write: (chunk: string) => {
        if (this.closed) {
          return false
        }

        const text = String(chunk).trim()
        this.stdout.write(
          JSON.stringify({
            type: 'assistant',
            session_id: this.sessionId,
            message: {
              role: 'assistant',
              content: [{ type: 'text', text: `echo:${text}` }],
            },
          }) + '\n',
        )
        return true
      },
    }

    queueMicrotask(() => {
      if (this.closed) {
        return
      }
      this.stdout.write(
        JSON.stringify({
          type: 'system',
          subtype: 'init',
          session_id: this.sessionId,
        }) + '\n',
      )
    })
  }

  kill(): void {
    if (this.closed) {
      return
    }
    this.closed = true
    this.stdout.end()
    this.stderr.end()
    this.emit('exit', 0)
  }
}

class DeterministicBackend {
  async spawnSession(opts: {
    cwd: string
    dangerouslySkipPermissions?: boolean
    resumeSessionId?: string
  }): Promise<{ child: ServerSessionProcess; workDir: string }> {
    const sessionId = opts.resumeSessionId ?? randomUUID()
    return {
      child: new DeterministicSessionProcess(sessionId),
      workDir: opts.cwd,
    }
  }
}

type RunningServer = {
  config: ServerConfig
  manager: SessionManager
  port?: number
  stop: () => Promise<void>
  authHeader: Record<string, string>
  configDir: string
  workspaceDir: string
}

const runningServers: RunningServer[] = []

afterEach(async () => {
  while (runningServers.length > 0) {
    const current = runningServers.pop()!
    await current.stop()
  }
})

async function startTestServer(options?: {
  unix?: boolean
  noAuth?: boolean
}): Promise<RunningServer> {
  const tempRoot = await mkdtemp(join(tmpdir(), 'claude-server-e2e-'))
  const configDir = join(tempRoot, 'config')
  const workspaceDir = join(tempRoot, 'workspace')
  await mkdir(configDir, { recursive: true })
  await mkdir(workspaceDir, { recursive: true })
  process.env.CLAUDE_CONFIG_DIR = configDir

  const backend: SessionBackendLike = new DeterministicBackend()
    const manager = new SessionManager(backend, {
      idleTimeoutMs: 0,
  })
  const config: ServerConfig = {
    port: 0,
    host: '127.0.0.1',
    authToken: options?.noAuth ? undefined : 'test-token',
    workspace: workspaceDir,
    ...(options?.unix ? { unix: join(tempRoot, 'server.sock') } : {}),
  }
  const logger = {
    info: (_message: string) => {},
    warn: (_message: string) => {},
    error: (_message: string) => {},
  }
  const started = startServer(config, manager, logger)

  const runtime: RunningServer = {
    config,
    manager,
    port: started.port,
    authHeader: config.authToken
      ? { authorization: `Bearer ${config.authToken}` }
      : {},
    configDir,
    workspaceDir,
    stop: async () => {
      started.stop(true)
      await manager.destroyAll()
      delete process.env.CLAUDE_CONFIG_DIR
    },
  }
  runningServers.push(runtime)
  return runtime
}

function buildHttpUrl(server: RunningServer, path: string): string {
  return server.config.unix
    ? `http://localhost${path}`
    : `http://127.0.0.1:${server.port}${path}`
}

function buildFetchInit(server: RunningServer, init?: RequestInit): RequestInit {
  return server.config.unix
    ? ({ ...init, unix: server.config.unix } as RequestInit)
    : (init ?? {})
}

async function createSession(server: RunningServer): Promise<{ session_id: string; ws_url: string; work_dir?: string }> {
  const response = await fetch(
    buildHttpUrl(server, '/sessions'),
    buildFetchInit(server, {
      method: 'POST',
      headers: {
        ...server.authHeader,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ cwd: server.workspaceDir }),
    }),
  )
  expect(response.status).toBe(200)
  return (await response.json()) as {
    session_id: string
    ws_url: string
    work_dir?: string
  }
}

function connectWebSocket(server: RunningServer, wsUrl: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(
      server.config.unix && wsUrl.startsWith('/')
        ? `ws://localhost${wsUrl}`
        : wsUrl,
      {
        headers: server.authHeader,
        ...(server.config.unix ? { unix: server.config.unix } : {}),
      } as unknown as string[],
    )
    socket.addEventListener('open', () => resolve(socket), { once: true })
    socket.addEventListener('error', event => reject(event), { once: true })
  })
}

function readNextMessage(socket: WebSocket): Promise<unknown> {
  return new Promise((resolve, reject) => {
    socket.addEventListener(
      'message',
      event => {
        resolve(JSON.parse(String(event.data)))
      },
      { once: true },
    )
    socket.addEventListener('error', event => reject(event), { once: true })
  })
}

describe('server module e2e', () => {
  test('tcp server exposes health, auth, session creation, listing, and websocket streaming', async () => {
    const server = await startTestServer()

    const health = await fetch(buildHttpUrl(server, '/health'))
    expect(health.status).toBe(200)
    expect(await health.text()).toBe('ok')

    const unauthorized = await fetch(buildHttpUrl(server, '/sessions'))
    expect(unauthorized.status).toBe(401)

    const emptyList = await fetch(
      buildHttpUrl(server, '/sessions'),
      buildFetchInit(server, { headers: server.authHeader }),
    )
    expect(emptyList.status).toBe(200)
    expect(await emptyList.json()).toEqual({ sessions: [] })

    const created = await createSession(server)
    expect(created.work_dir).toBe(server.workspaceDir)

    const storedSessions = await listSessionsImpl({
      dir: server.workspaceDir,
      limit: 0,
      offset: 0,
    })
    expect(storedSessions).toHaveLength(1)
    expect(storedSessions[0]?.sessionId).toBe(created.session_id)
    expect(storedSessions[0]?.cwd).toBe(server.workspaceDir)

    const listedAfterCreate = await fetch(
      buildHttpUrl(server, '/sessions'),
      buildFetchInit(server, { headers: server.authHeader }),
    )
    const createdSessions = (await listedAfterCreate.json()) as {
      sessions: Array<Record<string, unknown>>
    }
    expect(createdSessions.sessions).toHaveLength(1)
    expect(createdSessions.sessions[0]?.sessionId).toBe(created.session_id)
    expect(createdSessions.sessions[0]?.status).toBe('detached')
    expect(createdSessions.sessions[0]?.active).toBe(true)

    const detailResponse = await fetch(
      buildHttpUrl(server, `/sessions/${created.session_id}`),
      buildFetchInit(server, { headers: server.authHeader }),
    )
    expect(detailResponse.status).toBe(200)
    const detail = (await detailResponse.json()) as {
      session_id?: string
      records?: Array<Record<string, unknown>>
    }
    expect(detail.session_id).toBe(created.session_id)
    expect(detail.records?.length).toBeGreaterThan(0)

    const socket = await connectWebSocket(server, created.ws_url)
    socket.send(JSON.stringify({ type: 'user', text: 'ping' }))
    const echoed = (await readNextMessage(socket)) as {
      type: string
      session_id: string
      message?: { content?: Array<{ text?: string }> }
    }
    expect(echoed.type).toBe('assistant')
    expect(echoed.session_id).toBe(created.session_id)
    expect(echoed.message?.content?.[0]?.text).toBe(
      'echo:{"type":"user","text":"ping"}',
    )

    const storedAfterPrompt = await listSessionsImpl({
      dir: server.workspaceDir,
      limit: 0,
      offset: 0,
    })
    expect(storedAfterPrompt[0]?.summary).toBe('ping')

    socket.send(JSON.stringify({ type: 'custom-title', customTitle: 'Server Named Session' }))
    await readNextMessage(socket)
    socket.send(JSON.stringify({ type: 'tag', tag: 'release-candidate' }))
    await readNextMessage(socket)

    const storedAfterMetadata = await listSessionsImpl({
      dir: server.workspaceDir,
      limit: 0,
      offset: 0,
    })
    expect(storedAfterMetadata[0]?.customTitle).toBe('Server Named Session')
    expect(storedAfterMetadata[0]?.tag).toBe('release-candidate')
    expect(storedAfterMetadata[0]?.summary).toBe('Server Named Session')

    const listedWhileConnected = await fetch(
      buildHttpUrl(server, '/sessions'),
      buildFetchInit(server, { headers: server.authHeader }),
    )
    const connectedSessions = (await listedWhileConnected.json()) as {
      sessions: Array<Record<string, unknown>>
    }
    expect(connectedSessions.sessions[0]?.status).toBe('running')
    expect(connectedSessions.sessions[0]?.attachedClients).toBe(1)

    socket.close()
  })

  test('unix socket server supports session creation and listing', async () => {
    const server = await startTestServer({ unix: true })

    const health = await fetch(
      buildHttpUrl(server, '/health'),
      buildFetchInit(server),
    )
    expect(health.status).toBe(200)

    const created = await createSession(server)
    expect(created.ws_url).toBe(`/sessions/${created.session_id}/ws`)

    const sessionsResponse = await fetch(
      buildHttpUrl(server, '/sessions?limit=10&offset=0'),
      buildFetchInit(server, { headers: server.authHeader }),
    )
    const sessions = (await sessionsResponse.json()) as {
      sessions: Array<Record<string, unknown>>
    }
    expect(sessions.sessions).toHaveLength(1)
    expect(sessions.sessions[0]?.sessionId).toBe(created.session_id)
    expect(sessions.sessions[0]?.cwd).toBe(server.workspaceDir)
  })

  test('sessions endpoint validates pagination parameters', async () => {
    const server = await startTestServer()
    const response = await fetch(
      buildHttpUrl(server, '/sessions?limit=-1'),
      buildFetchInit(server, { headers: server.authHeader }),
    )
    expect(response.status).toBe(400)
    expect(await response.text()).toContain('Invalid limit')
  })

  test('server can run without auth token', async () => {
    const server = await startTestServer({ noAuth: true })

    const createResp = await fetch(
      buildHttpUrl(server, '/sessions'),
      buildFetchInit(server, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ cwd: server.workspaceDir }),
      }),
    )
    expect(createResp.status).toBe(200)
    const created = (await createResp.json()) as { session_id: string }

    const detailResp = await fetch(
      buildHttpUrl(server, `/sessions/${created.session_id}`),
      buildFetchInit(server),
    )
    expect(detailResp.status).toBe(200)
  })
})