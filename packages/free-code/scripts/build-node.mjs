/**
 * Node.js Build Script for free-code
 *
 * Replaces scripts/build.ts (which requires Bun) with a Node.js-compatible
 * build using esbuild. Bundles the CLI and the headless SDK entry points.
 *
 * Usage:
 *   node scripts/build-node.mjs [--dev] [--feature=FLAG] [--feature-set=dev-full]
 */

import { build } from 'esbuild'
import { readFileSync, existsSync, mkdirSync, chmodSync } from 'fs'
import { execSync } from 'child_process'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

/** @type {{ name: string; version: string }} */
const pkg = JSON.parse(readFileSync(resolve(__dirname, '../package.json'), 'utf-8'))

const args = process.argv.slice(2)
const dev = args.includes('--dev')

// -------------------------------------------------------------------------
// Feature flags (mirrors the logic in build.ts)
// -------------------------------------------------------------------------

const fullExperimentalFeatures = [
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
]

const defaultFeatures = ['VOICE_MODE']
const featureSet = new Set(defaultFeatures)

for (let i = 0; i < args.length; i++) {
  const arg = args[i]
  if (arg === '--feature-set' && args[i + 1]) {
    if (args[i + 1] === 'dev-full') {
      for (const f of fullExperimentalFeatures) featureSet.add(f)
    }
    i++
    continue
  }
  if (arg === '--feature-set=dev-full') {
    for (const f of fullExperimentalFeatures) featureSet.add(f)
    continue
  }
  if (arg === '--feature' && args[i + 1]) {
    featureSet.add(args[i + 1])
    i++
    continue
  }
  if (arg.startsWith('--feature=')) {
    featureSet.add(arg.slice('--feature='.length))
  }
}

// -------------------------------------------------------------------------
// Version
// -------------------------------------------------------------------------

function runGit(cmd) {
  try {
    return execSync(cmd, { cwd: resolve(__dirname, '..'), encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] }).trim() || null
  } catch {
    return null
  }
}

function getDevVersion(base) {
  const ts = new Date().toISOString()
  const date = ts.slice(0, 10).replaceAll('-', '')
  const time = ts.slice(11, 19).replaceAll(':', '')
  const sha = runGit('git rev-parse --short=8 HEAD') ?? 'unknown'
  return `${base}-dev.${date}.t${time}.sha${sha}`
}

const buildTime = new Date().toISOString()
const version = dev ? getDevVersion(pkg.version) : pkg.version
const outfile = dev ? './cli-dev' : './cli'

// -------------------------------------------------------------------------
// esbuild defines (mirrors build.ts defines)
// -------------------------------------------------------------------------

const defines = {
  'process.env.USER_TYPE': JSON.stringify('external'),
  'process.env.CLAUDE_CODE_FORCE_FULL_LOGO': JSON.stringify('true'),
  'process.env.CLAUDE_CODE_VERIFY_PLAN': JSON.stringify('false'),
  'process.env.CCR_FORCE_BUNDLE': JSON.stringify('true'),
  'MACRO.VERSION': JSON.stringify(version),
  'MACRO.BUILD_TIME': JSON.stringify(buildTime),
  'MACRO.PACKAGE_URL': JSON.stringify(pkg.name),
  'MACRO.NATIVE_PACKAGE_URL': 'undefined',
  'MACRO.FEEDBACK_CHANNEL': JSON.stringify('github'),
  'MACRO.ISSUES_EXPLAINER': JSON.stringify(
    'This reconstructed source snapshot does not include Anthropic internal issue routing.',
  ),
  'MACRO.VERSION_CHANGELOG': JSON.stringify(
    dev
      ? (runGit('git log --format=%h %s -20') ?? 'Local development build')
      : 'https://github.com/paoloanzn/free-code',
  ),
  ...(dev ? { 'process.env.NODE_ENV': JSON.stringify('development') } : {}),
  ...(dev
    ? { 'process.env.CLAUDE_CODE_EXPERIMENTAL_BUILD': JSON.stringify('true') }
    : {}),
}

// Per-feature defines: replace feature('FLAG') booleans via define
// (matches what bun build --feature=FLAG does at compile time)
const featureDefines = {}
for (const f of fullExperimentalFeatures) {
  featureDefines[`__feature_${f}`] = featureSet.has(f) ? 'true' : 'false'
}

// -------------------------------------------------------------------------
// Build CLI bundle
// -------------------------------------------------------------------------

mkdirSync(dirname(resolve(outfile)), { recursive: true })

await build({
  entryPoints: [resolve(__dirname, '../src/entrypoints/cli.tsx')],
  bundle: true,
  outfile,
  format: 'esm',
  platform: 'node',
  target: 'node20',
  minify: !dev,
  sourcemap: dev ? 'inline' : false,
  // Redirect bun:bundle → our Node.js shim
  alias: {
    'bun:bundle': resolve(__dirname, '../src/vendor/bun-bundle.ts'),
  },
  // Native-only packages that cannot be bundled
  external: [
    '@ant/*',
    'audio-capture-napi',
    'image-processor-napi',
    'modifiers-napi',
    'url-handler-napi',
    'bun:ffi',
  ],
  define: { ...defines, ...featureDefines },
  jsx: 'automatic',
  // Needed so esbuild can handle TypeScript path aliases (src/*)
  tsconfig: resolve(__dirname, '../tsconfig.json'),
})

if (existsSync(outfile)) {
  chmodSync(outfile, 0o755)
}

console.log(`Built ${outfile}  (features: ${[...featureSet].join(', ')})`)
