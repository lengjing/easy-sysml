import { randomUUID } from 'crypto'
import { EventEmitter } from 'events'
import { mkdir, mkdtemp } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { PassThrough } from 'stream'
import { startServer } from '../src/server/server.js'
import { SessionManager } from '../src/server/sessionManager.js'
import type { ServerSessionProcess } from '../src/server/runtimeState.js'
import type { ServerLogger } from '../src/server/serverLog.js'
import type { ServerConfig } from '../src/server/types.js'
import { listSessionsImpl } from '../src/utils/listSessionsImpl.js'

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message)
  }
}

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
  authHeader: Record<string, string>
  workspaceDir: string
  stop: () => Promise<void>
}

function buildHttpUrl(server: RunningServer, path: string): string {
  return `http://127.0.0.1:${server.port}${path}`
}

async function createRunningServer(options?: {
  noAuth?: boolean
}): Promise<RunningServer> {
  const tempRoot = await mkdtemp(join(tmpdir(), 'claude-server-smoke-'))
  const configDir = join(tempRoot, 'config')
  const workspaceDir = join(tempRoot, 'workspace')
  await mkdir(configDir, { recursive: true })
  await mkdir(workspaceDir, { recursive: true })
  process.env.CLAUDE_CONFIG_DIR = configDir

  const manager = new SessionManager(new DeterministicBackend(), {
    idleTimeoutMs: 0,
  })
  const config: ServerConfig = {
    port: 0,
    host: '127.0.0.1',
    authToken: options?.noAuth ? undefined : 'smoke-token',
    workspace: workspaceDir,
  }
  const logger: ServerLogger = {
    info: message => process.stderr.write(`[smoke info] ${message}\n`),
    warn: message => process.stderr.write(`[smoke warn] ${message}\n`),
    error: message => process.stderr.write(`[smoke error] ${message}\n`),
  }
  const started = startServer(config, manager, logger)

  return {
    config,
    manager,
    port: started.port,
    authHeader: config.authToken
      ? { authorization: `Bearer ${config.authToken}` }
      : {},
    workspaceDir,
    stop: async () => {
      started.stop(true)
      await manager.destroyAll()
      delete process.env.CLAUDE_CONFIG_DIR
    },
  }
}

async function fetchJson(server: RunningServer, path: string, init?: RequestInit) {
  const response = await fetch(buildHttpUrl(server, path), init)
  const data = await response.json()
  return { response, data }
}

async function connectWebSocket(server: RunningServer, wsUrl: string): Promise<WebSocket> {
  return await new Promise((resolve, reject) => {
    const socket = new WebSocket(wsUrl, {
      headers: server.authHeader,
    } as unknown as string[])
    socket.addEventListener('open', () => resolve(socket), { once: true })
    socket.addEventListener('error', event => reject(event), { once: true })
  })
}

async function readNextMessage(socket: WebSocket): Promise<Record<string, unknown>> {
  return await new Promise((resolve, reject) => {
    socket.addEventListener(
      'message',
      event => resolve(JSON.parse(String(event.data)) as Record<string, unknown>),
      { once: true },
    )
    socket.addEventListener('error', event => reject(event), { once: true })
  })
}

async function runAuthenticatedScenario(): Promise<void> {
  const server = await createRunningServer()

  try {
    const healthResponse = await fetch(buildHttpUrl(server, '/health'))
    assert(healthResponse.status === 200, 'GET /health should return 200')
    assert(await healthResponse.text() === 'ok', 'GET /health should return ok')
    console.log('PASS /health')

    const unauthorized = await fetch(buildHttpUrl(server, '/sessions'))
    assert(unauthorized.status === 401, 'GET /sessions without auth should return 401')
    console.log('PASS auth guard')

    const emptyList = await fetchJson(server, '/sessions', {
      headers: server.authHeader,
    })
    assert(emptyList.response.status === 200, 'GET /sessions should return 200')
    assert(
      Array.isArray((emptyList.data as { sessions?: unknown[] }).sessions) &&
        (emptyList.data as { sessions: unknown[] }).sessions.length === 0,
      'GET /sessions should be empty before creation',
    )
    console.log('PASS empty /sessions')

    const invalidLimit = await fetch(buildHttpUrl(server, '/sessions?limit=-1'), {
      headers: server.authHeader,
    })
    assert(invalidLimit.status === 400, 'GET /sessions?limit=-1 should return 400')
    console.log('PASS pagination validation')

    const created = await fetchJson(server, '/sessions', {
      method: 'POST',
      headers: {
        ...server.authHeader,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ cwd: server.workspaceDir }),
    })
    assert(created.response.status === 200, 'POST /sessions should return 200')
    const createdBody = created.data as {
      session_id?: string
      ws_url?: string
      work_dir?: string
    }
    assert(typeof createdBody.session_id === 'string', 'POST /sessions should return session_id')
    assert(typeof createdBody.ws_url === 'string', 'POST /sessions should return ws_url')
    assert(createdBody.work_dir === server.workspaceDir, 'POST /sessions should return work_dir')
    console.log('PASS POST /sessions')

    const persistedSessions = await listSessionsImpl({
      dir: server.workspaceDir,
      limit: 0,
      offset: 0,
    })
    assert(persistedSessions.length === 1, 'persisted sessions should contain the new session immediately')
    assert(
      persistedSessions[0]?.sessionId === createdBody.session_id,
      'persisted session should match created session id',
    )
    console.log('PASS persisted-before-active guarantee')

    const listed = await fetchJson(server, '/sessions', {
      headers: server.authHeader,
    })
    const listedSessions = (listed.data as { sessions?: Array<Record<string, unknown>> }).sessions ?? []
    assert(listed.response.status === 200, 'GET /sessions after create should return 200')
    assert(listedSessions.length === 1, 'GET /sessions after create should return one session')
    assert(listedSessions[0]?.sessionId === createdBody.session_id, 'listed session id should match created id')
    assert(listedSessions[0]?.active === true, 'listed session should be active')
    assert(listedSessions[0]?.status === 'detached', 'listed session should be detached before websocket attach')
    console.log('PASS GET /sessions after create')

    const detail = await fetchJson(server, `/sessions/${createdBody.session_id}`, {
      headers: server.authHeader,
    })
    assert(detail.response.status === 200, 'GET /sessions/:id should return 200')
    const detailBody = detail.data as { session_id?: string; records?: unknown[] }
    assert(detailBody.session_id === createdBody.session_id, 'detail session id should match created id')
    assert(Array.isArray(detailBody.records) && detailBody.records.length > 0, 'detail response should include records')
    console.log('PASS GET /sessions/:id')

    const missingDetail = await fetch(buildHttpUrl(server, '/sessions/does-not-exist'), {
      headers: server.authHeader,
    })
    assert(missingDetail.status === 404, 'GET /sessions/:id for missing session should return 404')
    console.log('PASS missing detail 404')

    const socket = await connectWebSocket(server, createdBody.ws_url!)
    try {
      socket.send(JSON.stringify({ type: 'user', text: 'ping' }))
      const echoed = await readNextMessage(socket)
      assert(echoed.type === 'assistant', 'websocket should emit assistant response')
      assert(echoed.session_id === createdBody.session_id, 'websocket response should carry session id')
      const echoedText = ((echoed.message as { content?: Array<{ text?: string }> })?.content ?? [])[0]?.text
      assert(echoedText === 'echo:{"type":"user","text":"ping"}', 'assistant response should echo input payload')

      socket.send(JSON.stringify({ type: 'custom-title', customTitle: 'Server Named Session' }))
      const titled = await readNextMessage(socket)
      assert(titled.type === 'custom-title', 'custom-title should be echoed to websocket clients')

      socket.send(JSON.stringify({ type: 'tag', tag: 'release-candidate' }))
      const tagged = await readNextMessage(socket)
      assert(tagged.type === 'tag', 'tag should be echoed to websocket clients')

      const storedAfterMetadata = await listSessionsImpl({
        dir: server.workspaceDir,
        limit: 0,
        offset: 0,
      })
      assert(storedAfterMetadata[0]?.customTitle === 'Server Named Session', 'persisted customTitle should update from websocket control message')
      assert(storedAfterMetadata[0]?.tag === 'release-candidate', 'persisted tag should update from websocket control message')
      assert(storedAfterMetadata[0]?.summary === 'Server Named Session', 'persisted summary should prefer customTitle')

      const listedWhileConnected = await fetchJson(server, '/sessions', {
        headers: server.authHeader,
      })
      const connectedSessions = (listedWhileConnected.data as { sessions?: Array<Record<string, unknown>> }).sessions ?? []
      assert(connectedSessions[0]?.status === 'running', 'session should be running while websocket is attached')
      assert(connectedSessions[0]?.attachedClients === 1, 'session should report one attached client')
    } finally {
      socket.close()
    }
    console.log('PASS websocket flow')
  } finally {
    await server.stop()
  }
}

async function runNoAuthScenario(): Promise<void> {
  const server = await createRunningServer({ noAuth: true })

  try {
    const createResp = await fetchJson(server, '/sessions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ cwd: server.workspaceDir }),
    })
    assert(createResp.response.status === 200, 'POST /sessions without auth token should return 200')
    const created = createResp.data as { session_id?: string }
    assert(typeof created.session_id === 'string', 'no-auth create should return session_id')

    const detailResp = await fetch(buildHttpUrl(server, `/sessions/${created.session_id}`))
    assert(detailResp.status === 200, 'GET /sessions/:id without auth token should return 200')
    console.log('PASS no-auth mode')
  } finally {
    await server.stop()
  }
}

async function main(): Promise<void> {
  await runAuthenticatedScenario()
  await runNoAuthScenario()
  console.log('All server API smoke checks passed')
}

await main()