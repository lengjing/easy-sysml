import { spawn, type ChildProcess } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { SessionManager, type CreateSessionOptions, type SessionBackend } from '../sessionManager.js'
import { startServer } from '../server.js'
import type { ServerLogger } from '../serverLog.js'
import type { ServerConfig } from '../types.js'

const TEST_DIR = dirname(fileURLToPath(import.meta.url))
const PACKAGE_ROOT = resolve(TEST_DIR, '../../..')
const SOURCE_ENTRYPOINT = resolve(TEST_DIR, '../../entrypoints/cli.tsx')

class ResultBackend implements SessionBackend {
  createSession(options: CreateSessionOptions): ChildProcess {
    const script = [
      "const readline = require('node:readline');",
      "console.log(JSON.stringify({ type: 'system', subtype: 'init', model: 'test-model', uuid: 'init-1', session_id: 'session-1', cwd: process.cwd(), apiKeySource: 'none', claude_code_version: 'test' }));",
      "const rl = readline.createInterface({ input: process.stdin });",
      "rl.on('line', line => {",
      '  const parsed = JSON.parse(line);',
      "  const content = typeof parsed?.message?.content === 'string' ? parsed.message.content : 'ok';",
      "  const result = content.toLowerCase().includes('exactly ok') ? 'ok' : `echo:${content}`;",
      "  console.log(JSON.stringify({ type: 'result', subtype: 'success', is_error: false, result, duration_ms: 0, duration_api_ms: 0, num_turns: 1, stop_reason: null, total_cost_usd: 0, usage: {}, modelUsage: {}, permission_denials: [], uuid: 'result-1', session_id: 'session-1' }));",
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

  return {
    base: `http://${config.host}:${port}`,
    server,
    sessions,
  }
}

async function runCli(args: string[]): Promise<{
  code: number
  stderr: string
  stdout: string
}> {
  const child = Bun.spawn([process.execPath, 'run', SOURCE_ENTRYPOINT, ...args], {
    cwd: PACKAGE_ROOT,
    env: {
      ...process.env,
      CLAUDE_CODE_SERVER_LOCKFILE: resolve(PACKAGE_ROOT, '.tmp-cli-test-lock.json'),
    },
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
  })

  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ])

  return { code, stdout, stderr }
}

describe('cli direct-connect flows', () => {
  it('exposes server and open in root help', async () => {
    const result = await runCli(['--help'])

    expect(result.code).toBe(0)
    expect(result.stdout).toContain('server [options]')
    expect(result.stdout).toContain('open [options] <cc-url> [prompt]')
  })

  it('shows open subcommand help', async () => {
    const result = await runCli(['open', '--help'])

    expect(result.code).toBe(0)
    expect(result.stdout).toContain('Usage: claude open [options] <cc-url> [prompt]')
    expect(result.stdout).toContain('--output-format <format>')
  })

  it('connects through the open command in print mode', async () => {
    const testServer = await startTestServer()

    try {
      const port = new URL(testServer.base).port
      const result = await runCli([
        'open',
        `cc://127.0.0.1:${port}/secret`,
        'Reply exactly ok',
        '-p',
        '--output-format',
        'json',
        '--dangerously-skip-permissions',
      ])

      expect(result.code).toBe(0)
      expect(result.stdout).toContain('"type":"result"')
      expect(result.stdout).toContain('"result":"ok"')
    } finally {
      await testServer.sessions.destroyAll()
      testServer.server.stop(true)
    }
  })

  it('connects through the top-level cc:// rewrite path in print mode', async () => {
    const testServer = await startTestServer()

    try {
      const port = new URL(testServer.base).port
      const result = await runCli([
        `cc://127.0.0.1:${port}/secret`,
        'Reply exactly ok',
        '-p',
        '--output-format',
        'json',
        '--dangerously-skip-permissions',
      ])

      expect(result.code).toBe(0)
      expect(result.stdout).toContain('"type":"result"')
      expect(result.stdout).toContain('"result":"ok"')
    } finally {
      await testServer.sessions.destroyAll()
      testServer.server.stop(true)
    }
  })
})