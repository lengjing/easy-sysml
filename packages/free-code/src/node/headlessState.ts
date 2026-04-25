import { getDefaultAppState } from '../state/AppStateStore.js'
import { createStore } from '../state/store.js'
import type { AppState } from '../state/AppStateStore.js'
import type { Store } from '../state/store.js'

export function createHeadlessStore(options?: {
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
