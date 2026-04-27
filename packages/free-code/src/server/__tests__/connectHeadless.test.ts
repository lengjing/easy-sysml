import { spawn, type ChildProcess } from 'node:child_process'
import { describe, expect, it, vi } from 'vitest'
import { runConnectHeadless } from '../connectHeadless.js'
import { createDirectConnectSession } from '../createDirectConnectSession.js'
import { SessionManager, type CreateSessionOptions, type SessionBackend } from '../sessionManager.js'
import { startServer } from '../server.js'
import type { ServerLogger } from '../serverLog.js'
import type { ServerConfig } from '../types.js'

class ResultBackend implements SessionBackend {
  createSession(options: CreateSessionOptions): ChildProcess {
    const script = [
      "const readline = require('node:readline');",
      "console.log(JSON.stringify({ type: 'system', subtype: 'init', model: 'test-model', uuid: 'init-1', session_id: 'session-1', cwd: process.cwd(), apiKeySource: 'none', claude_code_version: 'test' }));",
      "const rl = readline.createInterface({ input: process.stdin });",
      "rl.on('line', line => {",
      "  const parsed = JSON.parse(line);",
      "  const content = typeof parsed?.message?.content === 'string' ? parsed.message.content : 'ok';",
      "  console.log(JSON.stringify({ type: 'result', subtype: 'success', is_error: false, result: `echo:${content}`, duration_ms: 0, duration_api_ms: 0, num_turns: 1, stop_reason: null, total_cost_usd: 0, usage: {}, modelUsage: {}, permission_denials: [], uuid: 'result-1', session_id: 'session-1' }));",
      '  process.exit(0);',
      '});',
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
    authToken: 'secret',
    idleTimeoutMs: 0,
    ...overrides,
  }
}

async function startTestServer(overrides: Partial<ServerConfig> = {}) {
  const config = makeConfig(overrides)
  const sessions = new SessionManager(new ResultBackend(), {
    idleTimeoutMs: config.idleTimeoutMs,
    maxSessions: config.maxSessions,
  })
  const server = await startServer(config, sessions, logger)
  const port = server.port ?? config.port
  const base = `http://${config.host}:${port}`

  return {
    base,
    server,
    sessions,
  }
}

describe('runConnectHeadless', () => {
  it('prints the final result in text mode', async () => {
    const testServer = await startTestServer()
    const stdoutWrite = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true)
    const stderrWrite = vi
      .spyOn(process.stderr, 'write')
      .mockImplementation(() => true)

    try {
      const session = await createDirectConnectSession({
        serverUrl: testServer.base,
        authToken: 'secret',
        cwd: process.cwd(),
      })

      await runConnectHeadless(session.config, 'hello', 'text', true)

      expect(stdoutWrite).toHaveBeenCalledWith('echo:hello\n')
      expect(stderrWrite).not.toHaveBeenCalled()
    } finally {
      stdoutWrite.mockRestore()
      stderrWrite.mockRestore()
      await testServer.sessions.destroyAll()
      testServer.server.stop(true)
    }
  })

  it('streams sdk messages in stream-json mode', async () => {
    const testServer = await startTestServer()
    const stdoutWrite = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true)

    try {
      const session = await createDirectConnectSession({
        serverUrl: testServer.base,
        authToken: 'secret',
        cwd: process.cwd(),
      })

      await runConnectHeadless(session.config, 'hello', 'stream-json', true)

      const output = stdoutWrite.mock.calls.map(call => String(call[0])).join('')
      expect(output).toContain('"type":"system"')
      expect(output).toContain('"type":"result"')
      expect(output).toContain('echo:hello')
    } finally {
      stdoutWrite.mockRestore()
      await testServer.sessions.destroyAll()
      testServer.server.stop(true)
    }
  })
})