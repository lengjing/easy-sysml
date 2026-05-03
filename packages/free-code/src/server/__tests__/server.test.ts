import { spawn, type ChildProcess } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { mkdtemp, readFile } from 'node:fs/promises'
import { createConnection } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { SessionManager, type CreateSessionOptions, type SessionBackend } from '../sessionManager.js'
import { startServer } from '../server.js'
import type { ServerLogger } from '../serverLog.js'
import type { ServerConfig } from '../types.js'

class TestBackend implements SessionBackend {
  createSession(options: CreateSessionOptions): ChildProcess {
    lastCreateSessionOptions = options
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

let lastCreateSessionOptions: CreateSessionOptions | undefined

class StreamingBackend implements SessionBackend {
  createSession(options: CreateSessionOptions): ChildProcess {
    const script = [
      "const fs = require('node:fs');",
      "const path = require('node:path');",
      "const readline = require('node:readline');",
      "const rl = readline.createInterface({ input: process.stdin });",
      "console.log(JSON.stringify({ type: 'system', subtype: 'ready' }));",
      'rl.on(\'line\', line => {',
      '  const payload = JSON.parse(line);',
      '  if (payload.type !== \"user\") return;',
      '  const filePath = path.join(process.cwd(), \"generated.sysml\");',
      '  const fileContent = \"package GeneratedModel {}\";',
      '  fs.writeFileSync(filePath, fileContent, \"utf8\");',
      '  console.log(JSON.stringify({ type: \"assistant_partial\", delta: \"Generating SysML\" }));',
      '  console.log(JSON.stringify({ type: \"assistant\", message: { content: [',
      '    { type: \"text\", text: \"Generated model saved.\" },',
      '    { type: \"thinking\", thinking: \"Using Write to persist the model\" },',
      '    { type: \"tool_use\", id: \"write-1\", name: \"Write\", input: { file_path: \"generated.sysml\", content: fileContent } }',
      '  ] } }));',
      '  console.log(JSON.stringify({ type: \"tool_result\", tool_use_id: \"write-1\", is_error: false, content: [{ text: \"saved generated.sysml\" }] }));',
      '  console.log(JSON.stringify({ type: \"result\", is_error: false, result: \"ok\" }));',
      '});',
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

async function startStreamingTestServer(overrides: Partial<ServerConfig> = {}) {
  const config = makeConfig(overrides)
  const sessions = new SessionManager(new StreamingBackend(), {
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

async function collectWsMessages(url: string, outboundMessage: Record<string, unknown>): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url)
    const messages: string[] = []

    ws.addEventListener('open', () => {
      ws.send(JSON.stringify(outboundMessage))
    })

    ws.addEventListener('message', event => {
      messages.push(String(event.data))
      if (messages.some(message => message.includes('"type":"result"'))) {
        ws.close()
      }
    })

    ws.addEventListener('close', () => resolve(messages))
    ws.addEventListener('error', () => reject(new Error('websocket connect failed')))
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

  it('creates and deletes sessions', async () => {
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

      // GET /sessions now reads from the Claude filesystem (listSessionsImpl),
      // not from the in-memory map, so it returns an array of real Claude sessions.
      const list = await makeReq(testServer.base, '/sessions')
      expect(list.status).toBe(200)
      const sessions = (await list.json()) as Array<Record<string, unknown>>
      expect(Array.isArray(sessions)).toBe(true)

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

  it('forwards mcp_config entries to the backend', async () => {
    const testServer = await startTestServer()
    const mcpConfig = [
      JSON.stringify({
        mcpServers: {
          sysml_editor: {
            type: 'stdio',
            command: process.execPath,
            args: ['-e', 'process.exit(0)'],
          },
        },
      }),
    ]

    try {
      const create = await makeReq(testServer.base, '/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cwd: process.cwd(), mcp_config: mcpConfig }),
      })

      expect(create.status).toBe(201)
      expect(lastCreateSessionOptions?.mcpConfig).toEqual(mcpConfig)
    } finally {
      await testServer.sessions.destroyAll()
      testServer.server.stop(true)
      lastCreateSessionOptions = undefined
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

  it('streams assistant, tool, and result messages for SysML generation', async () => {
    const workDir = await mkdtemp(join(tmpdir(), 'free-code-server-test-'))
    const testServer = await startStreamingTestServer()
    try {
      const create = await makeReq(testServer.base, '/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cwd: workDir, prompt: 'generate sysml' }),
      })
      expect(create.status).toBe(201)
      const { ws_url } = (await create.json()) as { ws_url: string }

      const messages = await collectWsMessages(ws_url, {
        type: 'user',
        message: 'Create a SysML model',
      })

      expect(messages.some(message => message.includes('"type":"assistant_partial"'))).toBe(true)
      expect(messages.some(message => message.includes('"type":"assistant"'))).toBe(true)
      expect(messages.some(message => message.includes('"type":"tool_result"'))).toBe(true)
      expect(messages.some(message => message.includes('"type":"result"'))).toBe(true)

      const generatedFile = await readFile(join(workDir, 'generated.sysml'), 'utf8')
      expect(generatedFile).toContain('package GeneratedModel {}')
    } finally {
      await testServer.sessions.destroyAll()
      testServer.server.stop(true)
    }
  })
})