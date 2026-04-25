/**
 * Todo management tools for the free-code Node.js library.
 *
 * Adapted from free-code's TodoWriteTool and TodoReadTool
 * (`src/tools/TodoWriteTool/`, `src/tools/TodoReadTool/`).
 *
 * Provides an in-session task checklist to help the agent track its own
 * progress on multi-step tasks (similar to the Agents, Memory & Planning
 * features in free-code's experimental flags like VERIFICATION_AGENT).
 *
 * Unlike the CLI version (which stores todos in AppState), this implementation
 * uses a simple in-memory store per agent session. The store is process-scoped
 * and reset when the process exits.
 *
 * Todos have:
 *   - id: unique string
 *   - content: task description
 *   - status: 'pending' | 'in_progress' | 'completed'
 *   - priority: 'low' | 'medium' | 'high'
 */

import type { FreeCodeOptions, ToolDefinition, ToolResult } from '../types.js'

// ---------------------------------------------------------------------------
// Todo types (mirrors free-code's TodoListSchema)
// ---------------------------------------------------------------------------

export type TodoStatus = 'pending' | 'in_progress' | 'completed'
export type TodoPriority = 'low' | 'medium' | 'high'

export interface Todo {
  id: string
  content: string
  status: TodoStatus
  priority: TodoPriority
}

// ---------------------------------------------------------------------------
// In-memory store
// ---------------------------------------------------------------------------

/** Global todo store (process-scoped, one store per process) */
const todoStore: Todo[] = []

/** Clears all todos (useful in tests) */
export function clearTodos(): void {
  todoStore.splice(0, todoStore.length)
}

/** Returns a copy of the current todo list */
export function getTodos(): Todo[] {
  return [...todoStore]
}

let nextId = 1
function generateId(): string {
  return `todo-${nextId++}`
}

// ---------------------------------------------------------------------------
// todoRead
// ---------------------------------------------------------------------------

/**
 * Returns the current todo list.
 * Equivalent to free-code's TodoReadTool.call().
 */
export async function todoRead(_input: Record<string, unknown> = {}): Promise<ToolResult> {
  if (todoStore.length === 0) {
    return { output: 'No todos currently in session.', isError: false }
  }

  const lines = todoStore.map(t => {
    const statusIcon = t.status === 'completed' ? '✅' : t.status === 'in_progress' ? '🔄' : '⬜'
    const priorityTag = t.priority !== 'medium' ? ` [${t.priority}]` : ''
    return `${statusIcon} [${t.id}] ${t.content}${priorityTag}`
  })

  return {
    output: `Current todos (${todoStore.length}):\n${lines.join('\n')}`,
    isError: false,
  }
}

export const todoReadTool: ToolDefinition = {
  name: 'TodoRead',
  description:
    'Reads the current session todo list. ' +
    'Use this to check task progress and pending work. ' +
    'Adapted from free-code\'s TodoReadTool (`src/tools/TodoReadTool/`).',
  inputSchema: {
    type: 'object',
    properties: {},
    required: [],
  },
  execute(input) {
    return todoRead(input)
  },
}

// ---------------------------------------------------------------------------
// todoWrite
// ---------------------------------------------------------------------------

export interface TodoWriteInput {
  todos: Array<{
    id?: string
    content: string
    status?: TodoStatus
    priority?: TodoPriority
  }>
}

/**
 * Replaces the session todo list with the provided todos.
 * New todos without an id are auto-assigned one.
 * Equivalent to free-code's TodoWriteTool.call().
 */
export async function todoWrite(
  input: TodoWriteInput,
  _options: FreeCodeOptions = {},
): Promise<ToolResult> {
  const oldTodos = getTodos()
  todoStore.splice(0, todoStore.length)

  for (const t of input.todos) {
    todoStore.push({
      id: t.id ?? generateId(),
      content: t.content,
      status: t.status ?? 'pending',
      priority: t.priority ?? 'medium',
    })
  }

  const addedCount = todoStore.filter(
    n => !oldTodos.some(o => o.id === n.id),
  ).length
  const completedCount = todoStore.filter(t => t.status === 'completed').length
  const pendingCount = todoStore.filter(t => t.status === 'pending').length
  const inProgressCount = todoStore.filter(t => t.status === 'in_progress').length

  return {
    output: JSON.stringify({
      total: todoStore.length,
      added: addedCount,
      completed: completedCount,
      in_progress: inProgressCount,
      pending: pendingCount,
      todos: getTodos(),
    }),
    isError: false,
  }
}

export const todoWriteTool: ToolDefinition = {
  name: 'TodoWrite',
  description:
    'Creates or updates the session todo list. ' +
    'Replace the entire list to add, update, or remove tasks. ' +
    'Each todo needs content; id/status/priority are optional. ' +
    'Supports the Agents, Memory & Planning pattern from free-code ' +
    '(equivalent to VERIFICATION_AGENT and BUILTIN_EXPLORE_PLAN_AGENTS features). ' +
    'Adapted from free-code\'s TodoWriteTool (`src/tools/TodoWriteTool/`).',
  inputSchema: {
    type: 'object',
    properties: {
      todos: {
        type: 'array',
        description: 'The full updated todo list.',
        items: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: 'Existing todo ID to update. Omit to create a new todo.',
            },
            content: {
              type: 'string',
              description: 'Task description.',
            },
            status: {
              type: 'string',
              enum: ['pending', 'in_progress', 'completed'],
              description: 'Task status. Default: pending.',
            },
            priority: {
              type: 'string',
              enum: ['low', 'medium', 'high'],
              description: 'Task priority. Default: medium.',
            },
          },
          required: ['content'],
        },
      },
    },
    required: ['todos'],
  },
  execute(input, options) {
    return todoWrite(input as TodoWriteInput, options)
  },
}
