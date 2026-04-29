import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { CreateSessionOptions, SessionBackend } from '../sessionManager.js'

const SOURCE_ENTRYPOINT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../entrypoints/cli.tsx',
)

function getClaudeCommand(): { cmd: string; baseArgs: string[] } {
  if (process.env.FREE_CODE_BIN) {
    return { cmd: process.env.FREE_CODE_BIN, baseArgs: [] }
  }

  if (existsSync(SOURCE_ENTRYPOINT)) {
    return { cmd: process.execPath, baseArgs: ['run', SOURCE_ENTRYPOINT] }
  }

  const scriptPath =
    typeof Bun !== 'undefined' && Bun.main && !Bun.main.endsWith('[eval]')
      ? Bun.main
      : process.argv[1]

  const isBundled =
    !scriptPath || process.execPath === scriptPath
  const cmd = process.execPath
  const baseArgs = isBundled ? [] : [scriptPath]
  return { cmd, baseArgs }
}

export class DangerousBackend implements SessionBackend {
  createSession(options: CreateSessionOptions): ChildProcess {
    const { cmd, baseArgs } = getClaudeCommand()
    const args = [
      ...baseArgs,
      '-p',
      '--verbose',
      '--output-format',
      'stream-json',
      '--input-format',
      'stream-json',
    ]

    if (options.dangerouslySkipPermissions) {
      args.push('--dangerously-skip-permissions')
    }
    if (options.model) {
      args.push('--model', options.model)
    }
    if (options.systemPrompt) {
      args.push('--system-prompt', options.systemPrompt)
    }
    if (options.maxTurns !== undefined) {
      args.push('--max-turns', String(options.maxTurns))
    }
    if (options.allowedTools?.length) {
      args.push('--allowed-tools', ...options.allowedTools)
    }
    if (options.mcpConfig?.length) {
      args.push('--mcp-config', ...options.mcpConfig)
    }
    if (options.prompt) {
      args.push(options.prompt)
    }

    return spawn(cmd, args, {
      cwd: options.workDir,
      env: process.env,
      stdio: ['pipe', 'pipe', 'pipe'],
    })
  }
}