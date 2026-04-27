/**
 * free-code HTTP + WebSocket Server
 *
 * Exposes the free-code CLI as an HTTP/WebSocket service so it can be called
 * programmatically from any language or environment.
 *
 * Architecture:
 *  - Each "session" is a dedicated `claude -p --output-format stream-json
 *    --input-format stream-json` subprocess.
 *  - The HTTP layer handles session lifecycle (create / list / delete).
 *  - The WebSocket layer bridges stdin/stdout of the subprocess to the client.
 *
 * API
 * ───
 *   GET  /health
 *     → { status: "ok", version: string, sessions: number }
 *
 *   POST /sessions
 *     Body: { cwd?: string, dangerously_skip_permissions?: boolean,
 *             prompt?: string, model?: string, system_prompt?: string,
 *             max_turns?: number, allowed_tools?: string[] }
 *     → { session_id: string, ws_url: string, work_dir: string }
 *
 *   GET  /sessions
 *     → SessionInfo[]
 *
 *   DELETE /sessions/:id
 *     → { ok: true }
 *
 *   WebSocket /sessions/:id
 *     Client → Server: SDKUserMessage JSON (one per line)
 *     Server → Client: stream-json output lines from the CLI subprocess
 */

import { createServer as createHttpServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { spawn, type ChildProcess } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { isAbsolute, resolve } from 'node:path'
import { existsSync } from 'node:fs'
import { WebSocketServer, type WebSocket } from 'ws'
import type { ServerConfig, SessionInfo, SessionState } from './types.js'

// ── Helpers ───────────────────────────────────────────────────────────────────

function jsonResponse(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload),
  })
  res.end(payload)
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = ''
    req.on('data', (chunk: Buffer) => {
      data += chunk.toString()
    })
    req.on('end', () => resolve(data))
    req.on('error', reject)
  })
}

/**
 * Returns the command + args used to spawn a new claude subprocess.
 * In bundled mode the binary is process.execPath; otherwise it is the
 * source entry-point (process.argv[1]).
 */
function getClaudeCommand(): { cmd: string; baseArgs: string[] } {
  // Allow callers to override the binary for testing
  if (process.env.FREE_CODE_BIN) {
    return { cmd: process.env.FREE_CODE_BIN, baseArgs: [] }
  }
  const isBundled =
    typeof Bun !== 'undefined'
      ? process.execPath !== process.argv[1]
      : false
  const cmd = isBundled ? process.execPath : process.execPath
  const baseArgs = isBundled ? [] : [process.argv[1]!]
  return { cmd, baseArgs }
}

// ── Session manager ───────────────────────────────────────────────────────────

export interface ServerSession extends SessionInfo {
  /** Partial stdout line buffer for newline-framing */
  _stdoutBuf: string
  /** WebSocket connections watching this session */
  _sockets: Set<WebSocket>
  /** Auth token expected on connecting WebSockets (inherited from ServerConfig) */
  _authToken: string
}

class SessionManager {
  private sessions = new Map<string, ServerSession>()
  private config: ServerConfig

  constructor(config: ServerConfig) {
    this.config = config
  }

  /**
   * Spawn a new claude -p subprocess and register it as a session.
   */
  create(opts: {
    cwd?: string
    dangerouslySkipPermissions?: boolean
    prompt?: string
    model?: string
    systemPrompt?: string
    maxTurns?: number
    allowedTools?: string[]
  }): ServerSession {
    if (
      this.config.maxSessions &&
      this.sessions.size >= this.config.maxSessions
    ) {
      throw new Error(
        `Maximum number of concurrent sessions (${this.config.maxSessions}) reached`,
      )
    }

    const id = randomUUID()
    const workDir = opts.cwd
      ? isAbsolute(opts.cwd)
        ? opts.cwd
        : resolve(process.cwd(), opts.cwd)
      : this.config.workspace ?? process.cwd()

    if (!existsSync(workDir)) {
      throw new Error(`Working directory does not exist: ${workDir}`)
    }

    const { cmd, baseArgs } = getClaudeCommand()
    const args = [
      ...baseArgs,
      '-p',
      '--output-format',
      'stream-json',
      '--input-format',
      'stream-json',
    ]

    if (opts.dangerouslySkipPermissions) {
      args.push('--dangerously-skip-permissions')
    }
    if (opts.model) {
      args.push('--model', opts.model)
    }
    if (opts.systemPrompt) {
      args.push('--system-prompt', opts.systemPrompt)
    }
    if (opts.maxTurns !== undefined) {
      args.push('--max-turns', String(opts.maxTurns))
    }
    if (opts.allowedTools?.length) {
      args.push('--allowed-tools', ...opts.allowedTools)
    }
    // Inline the first prompt as a positional argument if provided
    if (opts.prompt) {
      args.push(opts.prompt)
    }

    const proc = spawn(cmd, args, {
      cwd: workDir,
      env: process.env,
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    const session: ServerSession = {
      id,
      status: 'starting' as SessionState,
      createdAt: Date.now(),
      workDir,
      process: proc as unknown as ChildProcess,
      _stdoutBuf: '',
      _sockets: new Set(),
      _authToken: this.config.authToken,
    }

    this.sessions.set(id, session)
    this._attachProcessHandlers(session)

    return session
  }

  private _attachProcessHandlers(session: ServerSession): void {
    const proc = session.process as unknown as ReturnType<typeof spawn>

    proc.stdout?.on('data', (chunk: Buffer) => {
      session.status = 'running'
      session._stdoutBuf += chunk.toString()
      // Flush complete newline-terminated lines to connected WebSockets
      const lines = session._stdoutBuf.split('\n')
      session._stdoutBuf = lines.pop() ?? ''
      for (const line of lines) {
        if (!line.trim()) continue
        for (const ws of session._sockets) {
          if (ws.readyState === 1 /* OPEN */) {
            ws.send(line)
          }
        }
      }
    })

    proc.stderr?.on('data', (chunk: Buffer) => {
      // Forward stderr as a synthetic error event so clients can surface it
      const msg = JSON.stringify({ type: 'server_error', content: chunk.toString() })
      for (const ws of session._sockets) {
        if (ws.readyState === 1) {
          ws.send(msg)
        }
      }
    })

    proc.on('exit', (code) => {
      session.status = 'stopped'
      // Flush any remaining buffer
      if (session._stdoutBuf.trim()) {
        for (const ws of session._sockets) {
          if (ws.readyState === 1) {
            ws.send(session._stdoutBuf)
          }
        }
        session._stdoutBuf = ''
      }
      const doneMsg = JSON.stringify({ type: 'server_session_done', exit_code: code })
      for (const ws of session._sockets) {
        if (ws.readyState === 1) {
          ws.send(doneMsg)
          ws.close()
        }
      }
      session._sockets.clear()

      // Auto-remove finished sessions after a short grace period
      setTimeout(() => {
        this.sessions.delete(session.id)
      }, 30_000)
    })
  }

  get(id: string): ServerSession | undefined {
    return this.sessions.get(id)
  }

  list(): SessionInfo[] {
    return Array.from(this.sessions.values()).map((s) => ({
      id: s.id,
      status: s.status,
      createdAt: s.createdAt,
      workDir: s.workDir,
      process: null, // don't expose ChildProcess to callers
    }))
  }

  stop(id: string): boolean {
    const session = this.sessions.get(id)
    if (!session) return false
    session.status = 'stopping'
    ;(session.process as unknown as ReturnType<typeof spawn>).kill('SIGTERM')
    this.sessions.delete(id)
    return true
  }

  stopAll(): void {
    for (const id of Array.from(this.sessions.keys())) {
      this.stop(id)
    }
  }

  get size(): number {
    return this.sessions.size
  }
}

// ── Public server factory ────────────────────────────────────────────────────

export interface FreeCodeServer {
  httpServer: ReturnType<typeof createHttpServer>
  wss: WebSocketServer
  sessions: SessionManager
  /** Convenience: start listening and return the bound address. */
  listen(port?: number, host?: string): Promise<{ port: number; host: string }>
  close(): Promise<void>
}

/** Build URL used in POST /sessions response */
function buildWsUrl(
  config: ServerConfig,
  sessionId: string,
  reqHost: string | undefined,
): string {
  const host = reqHost ?? `${config.host}:${config.port}`
  return `ws://${host}/sessions/${sessionId}`
}

export function createFreeCodeServer(config: ServerConfig): FreeCodeServer {
  const mgr = new SessionManager(config)
  const version: string =
    typeof MACRO !== 'undefined' ? (MACRO as Record<string, string>).VERSION ?? '0.0.0' : '0.0.0'

  // ── HTTP ──────────────────────────────────────────────────────────────────

  const httpServer = createHttpServer(async (req, res) => {
    // Auth check
    if (config.authToken) {
      const auth = req.headers['authorization'] ?? ''
      const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
      if (token !== config.authToken) {
        return jsonResponse(res, 401, { error: 'Unauthorized' })
      }
    }

    const url = req.url ?? '/'
    const method = req.method ?? 'GET'

    // GET /health
    if (method === 'GET' && url === '/health') {
      return jsonResponse(res, 200, {
        status: 'ok',
        version,
        sessions: mgr.size,
      })
    }

    // GET /sessions
    if (method === 'GET' && url === '/sessions') {
      return jsonResponse(res, 200, mgr.list())
    }

    // POST /sessions
    if (method === 'POST' && url === '/sessions') {
      let body: Record<string, unknown> = {}
      try {
        const raw = await readBody(req)
        if (raw.trim()) body = JSON.parse(raw) as Record<string, unknown>
      } catch {
        return jsonResponse(res, 400, { error: 'Invalid JSON body' })
      }

      try {
        const session = mgr.create({
          cwd: body.cwd as string | undefined,
          dangerouslySkipPermissions: Boolean(body.dangerously_skip_permissions),
          prompt: body.prompt as string | undefined,
          model: body.model as string | undefined,
          systemPrompt: body.system_prompt as string | undefined,
          maxTurns:
            body.max_turns !== undefined ? Number(body.max_turns) : undefined,
          allowedTools: Array.isArray(body.allowed_tools)
            ? (body.allowed_tools as string[])
            : undefined,
        })

        const wsUrl = buildWsUrl(config, session.id, req.headers.host)
        return jsonResponse(res, 201, {
          session_id: session.id,
          ws_url: wsUrl,
          work_dir: session.workDir,
        })
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        return jsonResponse(res, 400, { error: msg })
      }
    }

    // DELETE /sessions/:id
    const deleteMatch = /^\/sessions\/([^/]+)$/.exec(url)
    if (method === 'DELETE' && deleteMatch) {
      const id = deleteMatch[1]!
      const ok = mgr.stop(id)
      if (!ok) return jsonResponse(res, 404, { error: 'Session not found' })
      return jsonResponse(res, 200, { ok: true })
    }

    return jsonResponse(res, 404, { error: 'Not found' })
  })

  // ── WebSocket ─────────────────────────────────────────────────────────────

  const wss = new WebSocketServer({ noServer: true })

  httpServer.on('upgrade', (req, socket, head) => {
    const urlMatch = /^\/sessions\/([^/?]+)/.exec(req.url ?? '')
    if (!urlMatch) {
      socket.end('HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\n\r\n')
      return
    }
    const sessionId = urlMatch[1]!

    // Auth via query param or header
    let token = ''
    const qs = new URL(req.url ?? '', 'http://localhost').searchParams
    token = qs.get('token') ?? ''
    if (!token) {
      const auth = req.headers['authorization'] ?? ''
      token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
    }

    if (config.authToken && token !== config.authToken) {
      socket.end('HTTP/1.1 401 Unauthorized\r\nContent-Length: 0\r\n\r\n')
      return
    }

    const session = mgr.get(sessionId)
    if (!session) {
      socket.end('HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\n\r\n')
      return
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      session._sockets.add(ws)

      ws.on('message', (data: Buffer | string) => {
        const line = (typeof data === 'string' ? data : data.toString()) + '\n'
        const proc = session.process as unknown as ReturnType<typeof spawn>
        if (proc.stdin && !proc.stdin.destroyed) {
          proc.stdin.write(line)
        }
      })

      ws.on('close', () => {
        session._sockets.delete(ws)
      })
    })
  })

  // ── listen / close helpers ────────────────────────────────────────────────

  function listen(port?: number, host?: string): Promise<{ port: number; host: string }> {
    const p = port ?? config.port
    const h = host ?? config.host
    return new Promise((resolve, reject) => {
      httpServer.once('error', reject)
      httpServer.listen(p, h, () => {
        const addr = httpServer.address()
        const boundPort = typeof addr === 'object' && addr ? addr.port : p
        const boundHost = typeof addr === 'object' && addr ? addr.address : h
        resolve({ port: boundPort, host: boundHost })
      })
    })
  }

  function close(): Promise<void> {
    return new Promise((resolve, reject) => {
      mgr.stopAll()
      wss.close()
      httpServer.close((err) => {
        if (err) reject(err)
        else resolve()
      })
    })
  }

  return { httpServer, wss, sessions: mgr, listen, close }
}

// ── Standalone entry point (called by `claude serve`) ────────────────────────

export async function serveMain(
  opts: Partial<ServerConfig> & { quiet?: boolean } = {},
): Promise<void> {
  const config: ServerConfig = {
    port: opts.port ?? Number(process.env.CLAUDE_CODE_SERVER_PORT ?? 8080),
    host: opts.host ?? (process.env.CLAUDE_CODE_SERVER_HOST ?? '127.0.0.1'),
    authToken:
      opts.authToken ??
      (process.env.CLAUDE_CODE_SERVER_AUTH_TOKEN ?? ''),
    idleTimeoutMs: opts.idleTimeoutMs ?? 0,
    maxSessions: opts.maxSessions,
    workspace: opts.workspace,
  }

  const server = createFreeCodeServer(config)
  const { port, host } = await server.listen()

  const quiet = opts.quiet ?? false
  if (!quiet) {
    // biome-ignore lint/suspicious/noConsole:: intentional server startup message
    console.log(`free-code server listening on http://${host}:${port}`)
    // biome-ignore lint/suspicious/noConsole:: intentional server startup message
    console.log(`  WebSocket sessions: ws://${host}:${port}/sessions/:id`)
    if (config.authToken) {
      // biome-ignore lint/suspicious/noConsole:: intentional server startup message
      console.log('  Auth: Bearer token required')
    }
    // biome-ignore lint/suspicious/noConsole:: intentional server startup message
    console.log('Press Ctrl+C to stop.')
  }

  // Graceful shutdown
  process.on('SIGINT', async () => {
    if (!quiet) {
      // biome-ignore lint/suspicious/noConsole:: intentional shutdown message
      console.log('\nShutting down…')
    }
    await server.close()
    process.exit(0)
  })
}
