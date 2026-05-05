import { AsyncLocalStorage } from 'async_hooks'
import { getCwdState, getOriginalCwd } from '../bootstrap/state.js'

// Store a mutable box so that setCwd() (which handles `cd` within a session)
// can update the per-session directory without touching the global STATE.cwd
// used by other concurrent sessions.
const cwdOverrideStorage = new AsyncLocalStorage<{ current: string }>()

/**
 * Run a function with an overridden working directory for the current async context.
 * All calls to pwd()/getCwd() within the function (and its async descendants) will
 * return the overridden cwd instead of the global one. This enables concurrent
 * agents to each see their own working directory without affecting each other.
 */
export function runWithCwdOverride<T>(cwd: string, fn: () => T): T {
  return cwdOverrideStorage.run({ current: cwd }, fn)
}

/**
 * Update the working directory for the currently active session context.
 * Returns true if there was an active override context (server mode),
 * false if running in CLI mode (no per-session context).
 */
export function updateSessionCwd(cwd: string): boolean {
  const store = cwdOverrideStorage.getStore()
  if (store) {
    store.current = cwd
    return true
  }
  return false
}

/**
 * Get the current working directory
 */
export function pwd(): string {
  return cwdOverrideStorage.getStore()?.current ?? getCwdState()
}

/**
 * Get the current working directory or the original working directory if the current one is not available
 */
export function getCwd(): string {
  try {
    return pwd()
  } catch {
    return getOriginalCwd()
  }
}
