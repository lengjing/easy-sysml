import type { ServerConfig } from './types.js'

export function printBanner(
  config: ServerConfig,
  authToken: string,
  port: number,
): void {
  const base = config.unix
    ? `unix:${config.unix}`
    : `http://${config.host}:${port}`
  const wsBase = config.unix
    ? `unix:${config.unix}`
    : `ws://${config.host}:${port}/sessions/:id`

  // biome-ignore lint/suspicious/noConsole:: intentional server startup output
  console.log(`Claude Code session server listening on ${base}`)
  // biome-ignore lint/suspicious/noConsole:: intentional server startup output
  console.log(`  WebSocket sessions: ${wsBase}`)
  // biome-ignore lint/suspicious/noConsole:: intentional server startup output
  console.log(`  Authorization: Bearer ${authToken}`)
  // biome-ignore lint/suspicious/noConsole:: intentional server startup output
  console.log('Press Ctrl+C to stop.')
}