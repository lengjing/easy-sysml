/**
 * Node.js shim for Bun's `bun:bundle` compile-time feature flag module.
 *
 * In a native Bun build, `feature('FLAG_NAME')` is a compile-time macro that
 * returns a boolean literal and dead-code-eliminates the inactive branch.
 * In Node.js builds (using esbuild), this shim provides the same API at
 * runtime by reading flags from the `FREE_CODE_FEATURES` environment variable
 * or defaulting to the standard set.
 *
 * Usage:
 *   FREE_CODE_FEATURES=VOICE_MODE,ULTRATHINK,BRIDGE_MODE node cli.mjs
 *
 * When bundling with esbuild, use the `alias` option to redirect
 * `bun:bundle` → this file so all `feature()` calls use this runtime shim.
 */

// Features enabled by default (mirrors the Bun build default set)
const DEFAULT_ENABLED_FEATURES = new Set<string>(['VOICE_MODE'])

// Features that are "experimental full" (mirrors --feature-set=dev-full in build.ts)
const ALL_EXPERIMENTAL_FEATURES = new Set<string>([
  'AGENT_MEMORY_SNAPSHOT',
  'AGENT_TRIGGERS',
  'AGENT_TRIGGERS_REMOTE',
  'AWAY_SUMMARY',
  'BASH_CLASSIFIER',
  'BRIDGE_MODE',
  'BUILTIN_EXPLORE_PLAN_AGENTS',
  'CACHED_MICROCOMPACT',
  'CCR_AUTO_CONNECT',
  'CCR_MIRROR',
  'CCR_REMOTE_SETUP',
  'COMPACTION_REMINDERS',
  'CONNECTOR_TEXT',
  'EXTRACT_MEMORIES',
  'HISTORY_PICKER',
  'HOOK_PROMPTS',
  'KAIROS_BRIEF',
  'KAIROS_CHANNELS',
  'LODESTONE',
  'MCP_RICH_OUTPUT',
  'MESSAGE_ACTIONS',
  'NATIVE_CLIPBOARD_IMAGE',
  'NEW_INIT',
  'POWERSHELL_AUTO_MODE',
  'PROMPT_CACHE_BREAK_DETECTION',
  'QUICK_SEARCH',
  'SHOT_STATS',
  'TEAMMEM',
  'TOKEN_BUDGET',
  'TREE_SITTER_BASH',
  'TREE_SITTER_BASH_SHADOW',
  'ULTRAPLAN',
  'ULTRATHINK',
  'UNATTENDED_RETRY',
  'VERIFICATION_AGENT',
  'VOICE_MODE',
])

const ENABLED_FEATURES = (() => {
  const envFeatures = process.env['FREE_CODE_FEATURES']
  if (envFeatures === 'all') {
    return new Set(ALL_EXPERIMENTAL_FEATURES)
  }
  if (envFeatures) {
    return new Set(envFeatures.split(',').map((s) => s.trim()).filter(Boolean))
  }
  return new Set(DEFAULT_ENABLED_FEATURES)
})()

/**
 * Check whether a named feature flag is enabled.
 * Mirrors the compile-time `feature()` macro from `bun:bundle`.
 */
export function feature(name: string): boolean {
  return ENABLED_FEATURES.has(name)
}
