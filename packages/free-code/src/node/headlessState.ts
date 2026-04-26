import { getDefaultAppState } from '../state/AppStateStore.js'
import { createStore } from '../state/store.js'
import type { AppState } from '../state/AppStateStore.js'
import type { Store } from '../state/store.js'

export function createHeadlessStore(options?: {
  /**
   * Defaults to true — headless mode auto-approves all tool use, which is
   * appropriate for programmatic/automated usage in trusted environments.
   * Pass `false` to enforce rule-based permission checks.
   */
  bypassPermissions?: boolean
  verbose?: boolean
}): Store<AppState> {
  const defaultState = getDefaultAppState()
  const initial: AppState = {
    ...defaultState,
    verbose: options?.verbose ?? false,
    toolPermissionContext: {
      ...defaultState.toolPermissionContext,
      mode: options?.bypassPermissions !== false ? 'bypassPermissions' : 'default',
    },
  }
  return createStore(initial)
}
