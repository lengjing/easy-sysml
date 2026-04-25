/**
 * Binary discovery for free-code CLI.
 *
 * Locates the free-code executable in order of preference:
 * 1. Explicit `binPath` option
 * 2. `FREE_CODE_BIN` environment variable
 * 3. `./cli` relative to the package root (standard build output)
 * 4. `./cli-dev` relative to the package root (dev build output)
 * 5. `bun run src/entrypoints/cli.tsx` (source mode, requires Bun)
 */

import { existsSync } from 'fs'
import { resolve, join } from 'path'
import { fileURLToPath } from 'url'

/** Absolute path to the free-code package root */
export const PACKAGE_ROOT = resolve(
  fileURLToPath(import.meta.url),
  '../../..',  // src/node/utils.ts → src/node → src → package root
)

export type BinMode = 'binary' | 'bun-source'

export type ResolvedBin = {
  mode: BinMode
  /** Path to the binary, or `bun` when mode=bun-source */
  bin: string
  /** Extra args prepended to argv (e.g. the source path for bun) */
  prefixArgs: string[]
}

/**
 * Discover the free-code CLI binary or Bun source entrypoint.
 * Throws if nothing is found.
 */
export function resolveBin(binPath?: string): ResolvedBin {
  // 1. Explicit override
  if (binPath) {
    return { mode: 'binary', bin: resolve(binPath), prefixArgs: [] }
  }

  // 2. Environment variable
  const envBin = process.env.FREE_CODE_BIN
  if (envBin) {
    return { mode: 'binary', bin: resolve(envBin), prefixArgs: [] }
  }

  // 3. Built binary: ./cli (production build)
  const cliBin = join(PACKAGE_ROOT, 'cli')
  if (existsSync(cliBin)) {
    return { mode: 'binary', bin: cliBin, prefixArgs: [] }
  }

  // 4. Dev build: ./cli-dev
  const cliDevBin = join(PACKAGE_ROOT, 'cli-dev')
  if (existsSync(cliDevBin)) {
    return { mode: 'binary', bin: cliDevBin, prefixArgs: [] }
  }

  // 5. Bun source mode — requires bun to be on PATH
  const sourceEntry = join(PACKAGE_ROOT, 'src', 'entrypoints', 'cli.tsx')
  if (existsSync(sourceEntry)) {
    return {
      mode: 'bun-source',
      bin: 'bun',
      prefixArgs: ['run', sourceEntry],
    }
  }

  throw new Error(
    'free-code binary not found. ' +
      'Run `bun run build` to build the CLI, or set FREE_CODE_BIN to the binary path.',
  )
}
