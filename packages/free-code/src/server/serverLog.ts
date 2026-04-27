export type ServerLogger = {
  error: (message: string, error?: unknown) => void
  info: (message: string) => void
}

export function createServerLogger(): ServerLogger {
  return {
    error(message: string, error?: unknown) {
      const suffix =
        error instanceof Error ? `\n${error.stack ?? error.message}` : error ? `\n${String(error)}` : ''
      process.stderr.write(`${message}${suffix}\n`)
    },
    info(message: string) {
      process.stderr.write(`${message}\n`)
    },
  }
}