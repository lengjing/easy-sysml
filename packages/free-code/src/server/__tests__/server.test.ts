import { spawn, type ChildProcess } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { createConnection } from 'node:net'
import { describe, expect, it } from 'vitest'
import { SessionManager, type CreateSessionOptions, type SessionBackend } from '../sessionManager.js'
import { startServer } from '../server.js'
import type { ServerLogger } from '../serverLog.js'
import type { ServerConfig } from '../types.js'

class TestBackend implements SessionBackend {
  createSession(options: CreateSessionOptions): ChildProcess {
    const script = [
      "const readline = require('node:readline');",
      "console.log(JSON.stringify({ type: 'system', subtype: 'ready' }));",
      "const rl = readline.createInterface({ input: process.stdin });",
      "rl.on('line', line => console.log(line));",
      'setInterval(() => {}, 1000);',
    ].join(' ')

    return spawn(process.execPath, ['-e', script], {
      cwd: options.workDir,
      stdio: ['pipe', 'pipe', 'pipe'],
    })
  }
}

const logger: ServerLogger = {
  error() {},
  info() {},
}

function makeConfig(overrides: Partial<ServerConfig> = {}): ServerConfig {
  return {
    port: 0,
    host: '127.0.0.1',
    authToken: '',
    idleTimeoutMs: 0,
    ...overrides,
  }
}

async function startTestServer(overrides: Partial<ServerConfig> = {}) {
  const config = makeConfig(overrides)
  const sessions = new SessionManager(new TestBackend(), {
    idleTimeoutMs: config.idleTimeoutMs,
    maxSessions: config.maxSessions,
  })
  const server = await startServer(config, sessions, logger)
  const port = server.port ?? config.port
  const base = `http://${config.host}:${port}`

  return {
    base,
    config,
    port,
    server,
    sessions,
  }
}

async function makeReq(
  base: string,
  path: string,
  opts: RequestInit = {},
): Promise<Response> {
  return fetch(`${base}${path}`, opts)
}

function doWsHandshake(
  host: string,
  port: number,
  path: string,
  headers: Record<string, string> = {},
): Promise<number> {
  return new Promise(resolve => {
    const key = randomBytes(16).toString('base64')
    const socket = createConnection({ host, port })

    const extraHeaders = Object.entries(headers)
      .map(([name, value]) => `${name}: ${value}`)
      .join('\r\n')

    socket.write(
      `GET ${path} HTTP/1.1\r\n` +
        `Host: ${host}:${port}\r\n` +
        'Upgrade: websocket\r\n' +
        'Connection: Upgrade\r\n' +
        `Sec-WebSocket-Key: ${key}\r\n` +
        'Sec-WebSocket-Version: 13\r\n' +
        (extraHeaders ? `${extraHeaders}\r\n` : '') +
        '\r\n',
    )

    let data = ''
    socket.on('data', chunk => {
      data += chunk.toString()
      if (data.includes('\r\n\r\n')) {
        const match = /HTTP\/1\.[01] (\d+)/.exec(data)
        const code = match ? Number.parseInt(match[1]!, 10) : -1
        socket.destroy()
        resolve(code)
      }
    })
    socket.on('error', () => resolve(-1))
    setTimeout(() => {
      socket.destroy()
      resolve(-2)
    }, 2_000)
  })
}

describe('server command runtime modules', () => {
  it('serves GET /health', async () => {
    const testServer = await startTestServer()
    try {
      const response = await makeReq(testServer.base, '/health')
      expect(response.status).toBe(200)
      const body = (await response.json()) as Record<string, unknown>
      expect(body.status).toBe('ok')
      expect(body.sessions).toBe(0)
    } finally {
      await testServer.sessions.destroyAll()
      testServer.server.stop(true)
    }
  })

  it('requires auth token when configured', async () => {
    const testServer = await startTestServer({ authToken: 'secret' })
    try {
      const denied = await makeReq(testServer.base, '/health')
      expect(denied.status).toBe(401)

      const allowed = await makeReq(testServer.base, '/health', {
        headers: { Authorization: 'Bearer secret' },
      })
      expect(allowed.status).toBe(200)
    } finally {
      await testServer.sessions.destroyAll()
      testServer.server.stop(true)
    }
  })

  it('creates, lists, and deletes sessions', async () => {
    const testServer = await startTestServer()
    try {
      const create = await makeReq(testServer.base, '/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cwd: process.cwd(), prompt: 'hello' }),
      })
      expect(create.status).toBe(201)
      const created = (await create.json()) as Record<string, string>
      expect(created.session_id).toBeTruthy()
      expect(created.ws_url).toContain('/sessions/')

      const list = await makeReq(testServer.base, '/sessions')
      expect(list.status).toBe(200)
      const sessions = (await list.json()) as Array<Record<string, unknown>>
      expect(sessions).toHaveLength(1)
      expect(sessions[0]?.id).toBe(created.session_id)

      const deleted = await makeReq(
        testServer.base,
        `/sessions/${created.session_id}`,
        { method: 'DELETE' },
      )
      expect(deleted.status).toBe(200)
    } finally {
      await testServer.sessions.destroyAll()
      testServer.server.stop(true)
    }
  })

  it('accepts websocket upgrade for a valid session', async () => {
    const testServer = await startTestServer()
    try {
      const create = await makeReq(testServer.base, '/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cwd: process.cwd(), prompt: 'hello' }),
      })
      expect(create.status).toBe(201)
      const { session_id } = (await create.json()) as { session_id: string }

      const code = await doWsHandshake(
        testServer.config.host,
        testServer.port,
        `/sessions/${session_id}`,
      )
      expect(code).toBe(101)
    } finally {
      await testServer.sessions.destroyAll()
      testServer.server.stop(true)
    }
  })

  it('uses the configured workspace when cwd is omitted', async () => {
    const testServer = await startTestServer({ workspace: process.cwd() })
    try {
      const create = await makeReq(testServer.base, '/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })

      expect(create.status).toBe(201)
      const created = (await create.json()) as { work_dir: string }
      expect(created.work_dir).toBe(process.cwd())
    } finally {
      await testServer.sessions.destroyAll()
      testServer.server.stop(true)
    }
  })

  it('enforces max session limits', async () => {
    const testServer = await startTestServer({ maxSessions: 1 })
    try {
      const first = await makeReq(testServer.base, '/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cwd: process.cwd() }),
      })
      expect(first.status).toBe(201)

      const second = await makeReq(testServer.base, '/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cwd: process.cwd() }),
      })
      expect(second.status).toBe(400)
      const body = (await second.json()) as { error: string }
      expect(body.error).toContain('Maximum number of concurrent sessions')
    } finally {
      await testServer.sessions.destroyAll()
      testServer.server.stop(true)
    }
  })

  it('expires detached sessions after the idle timeout', async () => {
    const testServer = await startTestServer({ idleTimeoutMs: 50 })
    try {
      const create = await makeReq(testServer.base, '/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cwd: process.cwd() }),
      })
      expect(create.status).toBe(201)
      const { session_id } = (await create.json()) as { session_id: string }

      await new Promise<void>((resolve, reject) => {
        const ws = new WebSocket(`${testServer.base.replace('http', 'ws')}/sessions/${session_id}`)

        ws.addEventListener('open', () => {
          ws.close()
        })

        ws.addEventListener('close', () => resolve())
        ws.addEventListener('error', () => reject(new Error('websocket connect failed')))
      })

      await new Promise(resolve => setTimeout(resolve, 120))
      expect(testServer.sessions.get(session_id)).toBeUndefined()
    } finally {
      await testServer.sessions.destroyAll()
      testServer.server.stop(true)
    }
  })

  it('rejects websocket upgrade without auth token', async () => {
    const testServer = await startTestServer({ authToken: 'secret' })
    try {
      const create = await makeReq(testServer.base, '/sessions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer secret',
        },
        body: JSON.stringify({ cwd: process.cwd() }),
      })
      expect(create.status).toBe(201)
      const { session_id } = (await create.json()) as { session_id: string }

      const denied = await doWsHandshake(
        testServer.config.host,
        testServer.port,
        `/sessions/${session_id}`,
      )
      expect(denied).not.toBe(101)

      const allowed = await doWsHandshake(
        testServer.config.host,
        testServer.port,
        `/sessions/${session_id}?token=secret`,
      )
      expect(allowed).toBe(101)
    } finally {
      await testServer.sessions.destroyAll()
      testServer.server.stop(true)
    }
  })
})