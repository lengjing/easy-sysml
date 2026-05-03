import {
  createServer as createHttpServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http'
import { existsSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { WebSocketServer, type WebSocket } from 'ws'
import { SessionManager } from './sessionManager.js'
import type { ServerLogger } from './serverLog.js'
import type { ServerConfig } from './types.js'

export interface RunningServer {
  httpServer: ReturnType<typeof createHttpServer>
  port?: number
  stop(force?: boolean): void
  wss: WebSocketServer
}

function jsonResponse(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    'Content-Length': Buffer.byteLength(payload),
    'Content-Type': 'application/json',
  })
  res.end(payload)
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = ''
    req.on('data', chunk => {
      data += chunk.toString()
    })
    req.on('end', () => resolve(data))
    req.on('error', reject)
  })
}

function buildWsUrl(
  config: ServerConfig,
  sessionId: string,
  reqHost: string | undefined,
): string {
  const host = reqHost ?? `${config.host}:${config.port}`
  return `ws://${host}/sessions/${sessionId}`
}

export async function startServer(
  config: ServerConfig,
  sessions: SessionManager,
  logger: ServerLogger,
): Promise<RunningServer> {
  const version =
    typeof MACRO !== 'undefined'
      ? (MACRO as Record<string, string>).VERSION ?? '0.0.0'
      : '0.0.0'

  const httpServer = createHttpServer(async (req, res) => {
    if (config.authToken) {
      const auth = req.headers.authorization ?? ''
      const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
      if (token !== config.authToken) {
        return jsonResponse(res, 401, { error: 'Unauthorized' })
      }
    }

    const method = req.method ?? 'GET'
    const url = req.url ?? '/'

    if (method === 'GET' && url === '/health') {
      return jsonResponse(res, 200, {
        status: 'ok',
        version,
        sessions: sessions.size,
      })
    }

    if (method === 'GET' && url === '/sessions') {
      return jsonResponse(res, 200, await sessions.list())
    }

    if (method === 'POST' && url === '/sessions') {
      let body: Record<string, unknown> = {}
      try {
        const raw = await readBody(req)
        if (raw.trim()) {
          body = JSON.parse(raw) as Record<string, unknown>
        }
      } catch {
        return jsonResponse(res, 400, { error: 'Invalid JSON body' })
      }

      try {
        const session = sessions.create({
          allowedTools: Array.isArray(body.allowed_tools)
            ? (body.allowed_tools as string[])
            : undefined,
          authToken: config.authToken,
          cwd: body.cwd as string | undefined,
          dangerouslySkipPermissions: Boolean(body.dangerously_skip_permissions),
          maxTurns:
            body.max_turns !== undefined ? Number(body.max_turns) : undefined,
          mcpConfig: Array.isArray(body.mcp_config)
            ? (body.mcp_config as string[])
            : undefined,
          model: body.model as string | undefined,
          prompt: body.prompt as string | undefined,
          systemPrompt: body.system_prompt as string | undefined,
          workspace: config.workspace,
        })

        return jsonResponse(res, 201, {
          session_id: session.id,
          ws_url: buildWsUrl(config, session.id, req.headers.host),
          work_dir: session.workDir,
        })
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return jsonResponse(res, 400, { error: message })
      }
    }

    const deleteMatch = /^\/sessions\/([^/]+)$/.exec(url)
    if (method === 'DELETE' && deleteMatch) {
      const ok = sessions.stop(deleteMatch[1]!)
      if (!ok) {
        return jsonResponse(res, 404, { error: 'Session not found' })
      }
      return jsonResponse(res, 200, { ok: true })
    }

    return jsonResponse(res, 404, { error: 'Not found' })
  })

  const wss = new WebSocketServer({ noServer: true })

  httpServer.on('upgrade', (req, socket, head) => {
    const urlMatch = /^\/sessions\/([^/?]+)/.exec(req.url ?? '')
    if (!urlMatch) {
      socket.end('HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\n\r\n')
      return
    }

    let token = ''
    const query = new URL(req.url ?? '', 'http://localhost').searchParams
    token = query.get('token') ?? ''
    if (!token) {
      const auth = req.headers.authorization ?? ''
      token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
    }

    if (config.authToken && token !== config.authToken) {
      socket.end('HTTP/1.1 401 Unauthorized\r\nContent-Length: 0\r\n\r\n')
      return
    }

    const session = sessions.get(urlMatch[1]!)
    if (!session) {
      socket.end('HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\n\r\n')
      return
    }

    wss.handleUpgrade(req, socket, head, ws => {
      sessions.attachSocket(session.id, ws)

      ws.on('message', data => {
        const line = (typeof data === 'string' ? data : data.toString()) + '\n'
        const proc = session.process as typeof session.process & {
          stdin: NodeJS.WritableStream | null
        }
        if (proc.stdin && !proc.stdin.destroyed) {
          proc.stdin.write(line)
        }
      })

      ws.on('close', () => {
        sessions.detachSocket(session.id, ws)
      })
    })
  })

  httpServer.on('error', error => {
    logger.error('Server listener error', error)
  })

  if (config.unix && existsSync(config.unix)) {
    await rm(config.unix, { force: true })
  }

  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error) => {
      httpServer.off('listening', onListening)
      reject(error)
    }
    const onListening = () => {
      httpServer.off('error', onError)
      resolve()
    }

    httpServer.once('error', onError)
    httpServer.once('listening', onListening)
    if (config.unix) {
      httpServer.listen(config.unix)
    } else {
      httpServer.listen(config.port, config.host)
    }
  })

  const address = httpServer.address()
  const port = typeof address === 'object' && address && 'port' in address
    ? address.port
    : undefined

  return {
    httpServer,
    port,
    stop(force = false) {
      if (force) {
        wss.clients.forEach(client => client.terminate())
        httpServer.closeAllConnections?.()
      } else {
        wss.clients.forEach(client => client.close())
      }
      wss.close()
      httpServer.close()
      if (config.unix) {
        void rm(config.unix, { force: true }).catch(() => {})
      }
    },
    wss,
  }
}