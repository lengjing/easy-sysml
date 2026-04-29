/**
 * Built-in Plugin Initialization
 *
 * Initializes built-in plugins that ship with the CLI and appear in the
 * /plugin UI for users to enable/disable.
 *
 * Not all bundled features should be built-in plugins — use this for
 * features that users should be able to explicitly enable/disable. For
 * features with complex setup or automatic-enabling logic (e.g.
 * claude-in-chrome), use src/skills/bundled/ instead.
 *
 * To add a new built-in plugin:
 * 1. Import registerBuiltinPlugin from '../builtinPlugins.js'
 * 2. Call registerBuiltinPlugin() with the plugin definition here
 */

import { existsSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { registerBuiltinPlugin } from '../builtinPlugins.js'

const nodeCommand = process.release?.name === 'node' ? process.execPath : 'node'

function resolveSysmlLanguageServerEntry(): string | null {
  try {
    const packageMainUrl = import.meta.resolve('@easy-sysml/language-server/main')
    const packageMainPath = fileURLToPath(packageMainUrl)
    const packageRoot = path.resolve(path.dirname(packageMainPath), '..')
    const binEntry = path.join(packageRoot, 'bin', 'sysml-language-server.js')
    return existsSync(binEntry) ? binEntry : null
  } catch {
    return null
  }
}

/**
 * Initialize built-in plugins. Called during CLI startup.
 */
export function initBuiltinPlugins(): void {
  const sysmlLanguageServerEntry = resolveSysmlLanguageServerEntry()

  registerBuiltinPlugin({
    name: 'sysml-lsp',
    description: 'SysML v2 and KerML language server for .sysml and .kerml files.',
    defaultEnabled: true,
    isAvailable: () => sysmlLanguageServerEntry !== null,
    lspServers: {
      sysml: {
        command: nodeCommand,
        args: sysmlLanguageServerEntry ? [sysmlLanguageServerEntry] : [],
        extensionToLanguage: {
          '.sysml': 'sysml',
          '.kerml': 'kerml',
        },
        startupTimeout: 10000,
        restartOnCrash: true,
      },
    },
  })
}
