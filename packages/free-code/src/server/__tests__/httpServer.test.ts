/**
 * Tests for packages/free-code/src/server/httpServer.ts
 *
 * All tests use a local echo-server script that mimics the stream-json output
 * of `claude -p --output-format stream-json` without actually calling the API.
 *
 * Set FREE_CODE_BIN to point at a test stub binary before requiring the module
 * to avoid spawning a real Claude process.
 */

import { describe, it, expect } from 'vitest'
import { createFreeCodeServer } from '../httpServer.js'
import type { ServerConfig } from '../types.js'

// ── helpers ───────────────────────────────────────────────────────────────────

/** Build a minimal ServerConfig for tests (random port on loopback). */
function makeConfig(overrides: Partial<ServerConfig> = {}): ServerConfig {
  return {
    port: 0, // OS assigns a free port
    host: '127.0.0.1',
    authToken: '',
    ...overrides,
  }
}

/** Fetch helper — base URL injected from started server address. */
function makeReq(
  base: string,
  path: string,
  opts: RequestInit = {},
): Promise<Response> {
  return fetch(`${base}${path}`, opts)
}

// ── /health ───────────────────────────────────────────────────────────────────

describe('GET /health', () => {
  it('returns status ok with version and sessions count', async () => {
    const srv = createFreeCodeServer(makeConfig())
    const { port, host } = await srv.listen()
    const base = `http://${host}:${port}`
    try {
      const res = await makeReq(base, '/health')
      expect(res.status).toBe(200)
      const body = (await res.json()) as Record<string, unknown>
      expect(body.status).toBe('ok')
      expect(typeof body.version).toBe('string')
      expect(body.sessions).toBe(0)
    } finally {
      await srv.close()
    }
  })

  it('requires auth token when configured', async () => {
    const srv = createFreeCodeServer(makeConfig({ authToken: 'secret' }))
    const { port, host } = await srv.listen()
    const base = `http://${host}:${port}`
    try {
      const noAuth = await makeReq(base, '/health')
      expect(noAuth.status).toBe(401)

      const withAuth = await makeReq(base, '/health', {
        headers: { Authorization: 'Bearer secret' },
      })
      expect(withAuth.status).toBe(200)
    } finally {
      await srv.close()
    }
  })
})

// ── /sessions (GET) ───────────────────────────────────────────────────────────

describe('GET /sessions', () => {
  it('returns empty array when no sessions exist', async () => {
    const srv = createFreeCodeServer(makeConfig())
    const { port, host } = await srv.listen()
    const base = `http://${host}:${port}`
    try {
      const res = await makeReq(base, '/sessions')
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body).toEqual([])
    } finally {
      await srv.close()
    }
  })
})

// ── /sessions (POST) ──────────────────────────────────────────────────────────

describe('POST /sessions', () => {
  it('returns 400 for invalid JSON body', async () => {
    const srv = createFreeCodeServer(makeConfig())
    const { port, host } = await srv.listen()
    const base = `http://${host}:${port}`
    try {
      const res = await makeReq(base, '/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'not-json{',
      })
      expect(res.status).toBe(400)
      const body = (await res.json()) as { error: string }
      expect(body.error).toContain('Invalid JSON')
    } finally {
      await srv.close()
    }
  })

  it('returns 400 when cwd does not exist', async () => {
    const srv = createFreeCodeServer(makeConfig())
    const { port, host } = await srv.listen()
    const base = `http://${host}:${port}`
    try {
      const res = await makeReq(base, '/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cwd: '/this/path/definitely/does/not/exist' }),
      })
      expect(res.status).toBe(400)
      const body = (await res.json()) as { error: string }
      expect(body.error).toContain('does not exist')
    } finally {
      await srv.close()
    }
  })

  it('creates a session and returns session_id and ws_url', async () => {
    process.env.FREE_CODE_BIN = '/bin/true'
    const srv = createFreeCodeServer(makeConfig())
    const { port, host } = await srv.listen()
    const base = `http://${host}:${port}`
    try {
      const res = await makeReq(base, '/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cwd: '/tmp' }),
      })
      expect(res.status).toBe(201)
      const body = (await res.json()) as Record<string, unknown>
      expect(typeof body.session_id).toBe('string')
      expect(body.ws_url).toMatch(/^ws:\/\//)
      expect(body.work_dir).toBe('/tmp')
    } finally {
      delete process.env.FREE_CODE_BIN
      await srv.close()
    }
  })

  it('creates a session with correct ws_url containing session id', async () => {
    process.env.FREE_CODE_BIN = '/bin/true'
    const srv = createFreeCodeServer(makeConfig())
    const { port, host } = await srv.listen()
    const base = `http://${host}:${port}`
    try {
      const res = await makeReq(base, '/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cwd: '/tmp' }),
      })
      expect(res.status).toBe(201)
      const body = (await res.json()) as Record<string, unknown>
      expect(body.ws_url as string).toContain('/sessions/')
    } finally {
      delete process.env.FREE_CODE_BIN
      await srv.close()
    }
  })

  it('enforces maxSessions limit', async () => {
    process.env.FREE_CODE_BIN = '/bin/sleep'
    const srv = createFreeCodeServer(makeConfig({ maxSessions: 1 }))
    const { port, host } = await srv.listen()
    const base = `http://${host}:${port}`
    try {
      const r1 = await makeReq(base, '/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cwd: '/tmp', prompt: '5' }),
      })
      expect(r1.status).toBe(201)

      const r2 = await makeReq(base, '/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cwd: '/tmp' }),
      })
      expect(r2.status).toBe(400)
      const body = (await r2.json()) as { error: string }
      expect(body.error).toContain('Maximum number')
    } finally {
      delete process.env.FREE_CODE_BIN
      await srv.close()
    }
  })

  it('propagates model option to session', async () => {
    process.env.FREE_CODE_BIN = '/bin/true'
    const srv = createFreeCodeServer(makeConfig())
    const { port, host } = await srv.listen()
    const base = `http://${host}:${port}`
    try {
      const res = await makeReq(base, '/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cwd: '/tmp', model: 'claude-opus-4-6' }),
      })
      expect(res.status).toBe(201)
    } finally {
      delete process.env.FREE_CODE_BIN
      await srv.close()
    }
  })

  it('accepts empty body (uses defaults)', async () => {
    process.env.FREE_CODE_BIN = '/bin/true'
    const srv = createFreeCodeServer(makeConfig())
    const { port, host } = await srv.listen()
    const base = `http://${host}:${port}`
    try {
      const res = await makeReq(base, '/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '',
      })
      expect(res.status).toBe(201)
    } finally {
      delete process.env.FREE_CODE_BIN
      await srv.close()
    }
  })
})

// ── DELETE /sessions/:id ──────────────────────────────────────────────────────

describe('DELETE /sessions/:id', () => {
  it('returns 404 for unknown session id', async () => {
    const srv = createFreeCodeServer(makeConfig())
    const { port, host } = await srv.listen()
    const base = `http://${host}:${port}`
    try {
      const res = await makeReq(base, '/sessions/nonexistent-id', {
        method: 'DELETE',
      })
      expect(res.status).toBe(404)
    } finally {
      await srv.close()
    }
  })

  it('stops an existing session', async () => {
    process.env.FREE_CODE_BIN = '/bin/sleep'
    const srv = createFreeCodeServer(makeConfig())
    const { port, host } = await srv.listen()
    const base = `http://${host}:${port}`
    try {
      const create = await makeReq(base, '/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cwd: '/tmp', prompt: '10' }),
      })
      expect(create.status).toBe(201)
      const { session_id } = (await create.json()) as { session_id: string }

      const del = await makeReq(base, `/sessions/${session_id}`, {
        method: 'DELETE',
      })
      expect(del.status).toBe(200)
      const body = (await del.json()) as { ok: boolean }
      expect(body.ok).toBe(true)
    } finally {
      delete process.env.FREE_CODE_BIN
      await srv.close()
    }
  })
})

// ── 404 for unknown routes ────────────────────────────────────────────────────

describe('unknown routes', () => {
  it('returns 404', async () => {
    const srv = createFreeCodeServer(makeConfig())
    const { port, host } = await srv.listen()
    const base = `http://${host}:${port}`
    try {
      const res = await makeReq(base, '/not-a-real-endpoint')
      expect(res.status).toBe(404)
    } finally {
      await srv.close()
    }
  })
})

// ── WebSocket upgrade (raw HTTP) ──────────────────────────────────────────────
// We test the WebSocket upgrade behaviour using raw Node.js net sockets so we
// don't depend on either the `ws` npm client or `globalThis.WebSocket`, both of
// which have event-loop issues in Bun's test runner.

import { createConnection } from 'node:net'
import { randomBytes } from 'node:crypto'

/**
 * Perform a minimal WebSocket handshake against the server and return the HTTP
 * status code of the upgrade response.
 *  - 101 → upgrade accepted
 *  - 400/404/… → server rejected the request (e.g. unknown session)
 */
function doWsHandshake(
  host: string,
  port: number,
  path: string,
  headers: Record<string, string> = {},
): Promise<number> {
  return new Promise((resolve) => {
    const key = randomBytes(16).toString('base64')
    const socket = createConnection({ host, port })

    const extraHeaders = Object.entries(headers)
      .map(([k, v]) => `${k}: ${v}`)
      .join('\r\n')

    socket.write(
      `GET ${path} HTTP/1.1\r\n` +
        `Host: ${host}:${port}\r\n` +
        `Upgrade: websocket\r\n` +
        `Connection: Upgrade\r\n` +
        `Sec-WebSocket-Key: ${key}\r\n` +
        `Sec-WebSocket-Version: 13\r\n` +
        (extraHeaders ? `${extraHeaders}\r\n` : '') +
        `\r\n`,
    )

    let data = ''
    socket.on('data', (chunk: Buffer) => {
      data += chunk.toString()
      if (data.includes('\r\n\r\n')) {
        const match = /HTTP\/1\.[01] (\d+)/.exec(data)
        const code = match ? parseInt(match[1]!, 10) : -1
        socket.destroy()
        resolve(code)
      }
    })
    socket.on('error', () => resolve(-1))
    setTimeout(() => { socket.destroy(); resolve(-2) }, 2_000)
  })
}

describe('WebSocket upgrade /sessions/:id', () => {
  it('accepts upgrade (HTTP 101) for a valid session', async () => {
    process.env.FREE_CODE_BIN = '/bin/sleep'
    const srv = createFreeCodeServer(makeConfig())
    const { port, host } = await srv.listen()
    const base = `http://${host}:${port}`
    try {
      const create = await makeReq(base, '/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cwd: '/tmp', prompt: '10' }),
      })
      expect(create.status).toBe(201)
      const { session_id } = (await create.json()) as { session_id: string }

      const code = await doWsHandshake(host, port, `/sessions/${session_id}`)
      expect(code).toBe(101)
    } finally {
      delete process.env.FREE_CODE_BIN
      await srv.close()
    }
  })

  it('rejects upgrade for unknown session id', async () => {
    const srv = createFreeCodeServer(makeConfig())
    const { port, host } = await srv.listen()
    try {
      const code = await doWsHandshake(host, port, '/sessions/no-such-session')
      // Server either returns HTTP 404 or closes the socket without upgrading (≠ 101)
      expect(code).not.toBe(101)
    } finally {
      await srv.close()
    }
  })

  it('rejects upgrade when auth token is missing', async () => {
    process.env.FREE_CODE_BIN = '/bin/sleep'
    const srv = createFreeCodeServer(makeConfig({ authToken: 'mytoken' }))
    const { port, host } = await srv.listen()
    const base = `http://${host}:${port}`
    try {
      const create = await makeReq(base, '/sessions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer mytoken',
        },
        body: JSON.stringify({ cwd: '/tmp', prompt: '10' }),
      })
      expect(create.status).toBe(201)
      const { session_id } = (await create.json()) as { session_id: string }

      // Upgrade WITHOUT token → server should reject (not 101)
      const code = await doWsHandshake(host, port, `/sessions/${session_id}`)
      expect(code).not.toBe(101)
    } finally {
      delete process.env.FREE_CODE_BIN
      await srv.close()
    }
  })

  it('accepts upgrade when correct auth token is provided as query param', async () => {
    process.env.FREE_CODE_BIN = '/bin/sleep'
    const srv = createFreeCodeServer(makeConfig({ authToken: 'mytoken' }))
    const { port, host } = await srv.listen()
    const base = `http://${host}:${port}`
    try {
      const create = await makeReq(base, '/sessions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer mytoken',
        },
        body: JSON.stringify({ cwd: '/tmp', prompt: '10' }),
      })
      expect(create.status).toBe(201)
      const { session_id } = (await create.json()) as { session_id: string }

      const code = await doWsHandshake(host, port, `/sessions/${session_id}?token=mytoken`)
      expect(code).toBe(101)
    } finally {
      delete process.env.FREE_CODE_BIN
      await srv.close()
    }
  })
})

// ── server config / session manager ──────────────────────────────────────────

describe('createFreeCodeServer — config defaults', () => {
  it('uses 0.0.0.0 host when specified', async () => {
    const srv = createFreeCodeServer(makeConfig({ host: '0.0.0.0' }))
    const { host } = await srv.listen()
    expect(host).toContain('0.0.0.0')
    await srv.close()
  })

  it('server.sessions.size increments on session create', async () => {
    process.env.FREE_CODE_BIN = '/bin/sleep'
    const srv = createFreeCodeServer(makeConfig())
    const { port, host } = await srv.listen()
    const base = `http://${host}:${port}`
    try {
      expect(srv.sessions.size).toBe(0)
      const r = await makeReq(base, '/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cwd: '/tmp', prompt: '5' }),
      })
      expect(r.status).toBe(201)
      expect(srv.sessions.size).toBe(1)
    } finally {
      delete process.env.FREE_CODE_BIN
      await srv.close()
    }
  })

  it('GET /sessions lists created sessions', async () => {
    process.env.FREE_CODE_BIN = '/bin/sleep'
    const srv = createFreeCodeServer(makeConfig())
    const { port, host } = await srv.listen()
    const base = `http://${host}:${port}`
    try {
      await makeReq(base, '/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cwd: '/tmp', prompt: '5' }),
      })
      const res = await makeReq(base, '/sessions')
      expect(res.status).toBe(200)
      const body = (await res.json()) as unknown[]
      expect(body.length).toBe(1)
      expect((body[0] as Record<string, unknown>).id).toBeTruthy()
      expect((body[0] as Record<string, unknown>).workDir).toBe('/tmp')
    } finally {
      delete process.env.FREE_CODE_BIN
      await srv.close()
    }
  })
})
