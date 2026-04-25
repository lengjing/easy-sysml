/**
 * Tests for the Todo management tools.
 *
 * Adapted from free-code's TodoWriteTool and TodoReadTool.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import {
  todoRead,
  todoWrite,
  getTodos,
  clearTodos,
  todoReadTool,
  todoWriteTool,
} from '../tools/todo.js'
import type { Todo } from '../tools/todo.js'

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  clearTodos()
})

// ---------------------------------------------------------------------------
// todoRead
// ---------------------------------------------------------------------------

describe('todoRead', () => {
  it('returns a message when there are no todos', async () => {
    const result = await todoRead()
    expect(result.isError).toBe(false)
    expect(result.output).toContain('No todos')
  })

  it('lists all todos with status icons', async () => {
    await todoWrite({
      todos: [
        { content: 'Task one', status: 'pending' },
        { content: 'Task two', status: 'in_progress' },
        { content: 'Task three', status: 'completed' },
      ],
    })

    const result = await todoRead()
    expect(result.isError).toBe(false)
    expect(result.output).toContain('Task one')
    expect(result.output).toContain('Task two')
    expect(result.output).toContain('Task three')
    expect(result.output).toContain('✅') // completed
    expect(result.output).toContain('🔄') // in_progress
    expect(result.output).toContain('⬜') // pending
  })

  it('shows count in output', async () => {
    await todoWrite({
      todos: [
        { content: 'A' },
        { content: 'B' },
      ],
    })

    const result = await todoRead()
    expect(result.output).toContain('2')
  })

  it('shows priority tag for non-medium priorities', async () => {
    await todoWrite({
      todos: [
        { content: 'High task', priority: 'high' },
        { content: 'Low task', priority: 'low' },
        { content: 'Normal task', priority: 'medium' },
      ],
    })

    const result = await todoRead()
    expect(result.output).toContain('[high]')
    expect(result.output).toContain('[low]')
    expect(result.output).not.toContain('[medium]') // medium is hidden
  })
})

// ---------------------------------------------------------------------------
// todoWrite
// ---------------------------------------------------------------------------

describe('todoWrite', () => {
  it('creates new todos', async () => {
    const result = await todoWrite({
      todos: [{ content: 'First task' }],
    })

    expect(result.isError).toBe(false)
    const out = JSON.parse(result.output)
    expect(out.total).toBe(1)
    expect(out.added).toBe(1)
    expect(out.todos).toHaveLength(1)
    expect(out.todos[0].content).toBe('First task')
  })

  it('assigns auto-generated IDs when not provided', async () => {
    await todoWrite({
      todos: [{ content: 'Auto ID task' }],
    })

    const todos = getTodos()
    expect(todos[0].id).toMatch(/^todo-\d+/)
  })

  it('preserves provided IDs', async () => {
    await todoWrite({
      todos: [{ id: 'my-custom-id', content: 'Custom ID task' }],
    })

    const todos = getTodos()
    expect(todos[0].id).toBe('my-custom-id')
  })

  it('replaces the entire todo list', async () => {
    await todoWrite({ todos: [{ content: 'Old task' }] })
    await todoWrite({ todos: [{ content: 'New task' }] })

    const todos = getTodos()
    expect(todos).toHaveLength(1)
    expect(todos[0].content).toBe('New task')
  })

  it('defaults status to pending', async () => {
    await todoWrite({ todos: [{ content: 'No status' }] })
    const todos = getTodos()
    expect(todos[0].status).toBe('pending')
  })

  it('defaults priority to medium', async () => {
    await todoWrite({ todos: [{ content: 'No priority' }] })
    const todos = getTodos()
    expect(todos[0].priority).toBe('medium')
  })

  it('counts completed/pending/in_progress correctly', async () => {
    const result = await todoWrite({
      todos: [
        { content: 'A', status: 'completed' },
        { content: 'B', status: 'in_progress' },
        { content: 'C', status: 'pending' },
        { content: 'D', status: 'pending' },
      ],
    })

    const out = JSON.parse(result.output)
    expect(out.completed).toBe(1)
    expect(out.in_progress).toBe(1)
    expect(out.pending).toBe(2)
    expect(out.total).toBe(4)
  })

  it('can clear all todos by writing empty list', async () => {
    await todoWrite({ todos: [{ content: 'Task' }] })
    await todoWrite({ todos: [] })

    const todos = getTodos()
    expect(todos).toHaveLength(0)
  })

  it('round-trips status and priority values', async () => {
    await todoWrite({
      todos: [
        {
          id: 'test-1',
          content: 'Test task',
          status: 'in_progress',
          priority: 'high',
        },
      ],
    })

    const todos = getTodos()
    expect(todos[0]).toEqual<Todo>({
      id: 'test-1',
      content: 'Test task',
      status: 'in_progress',
      priority: 'high',
    })
  })

  it('handles multiple todos in sequence correctly', async () => {
    // First write: create tasks
    await todoWrite({
      todos: [
        { id: 't1', content: 'Explore codebase', status: 'pending' },
        { id: 't2', content: 'Write tests', status: 'pending' },
        { id: 't3', content: 'Fix bugs', status: 'pending' },
      ],
    })

    // Second write: update progress
    const result = await todoWrite({
      todos: [
        { id: 't1', content: 'Explore codebase', status: 'completed' },
        { id: 't2', content: 'Write tests', status: 'in_progress' },
        { id: 't3', content: 'Fix bugs', status: 'pending' },
      ],
    })

    const out = JSON.parse(result.output)
    expect(out.completed).toBe(1)
    expect(out.in_progress).toBe(1)
    expect(out.pending).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// todoReadTool (ToolDefinition)
// ---------------------------------------------------------------------------

describe('todoReadTool', () => {
  it('has correct name', () => {
    expect(todoReadTool.name).toBe('TodoRead')
  })

  it('has valid empty input schema', () => {
    expect(todoReadTool.inputSchema.required).toEqual([])
  })

  it('execute() delegates to todoRead()', async () => {
    const result = await todoReadTool.execute({}, {})
    expect(result.isError).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// todoWriteTool (ToolDefinition)
// ---------------------------------------------------------------------------

describe('todoWriteTool', () => {
  it('has correct name', () => {
    expect(todoWriteTool.name).toBe('TodoWrite')
  })

  it('has todos as required field', () => {
    expect(todoWriteTool.inputSchema.required).toContain('todos')
  })

  it('description mentions Memory & Planning', () => {
    expect(todoWriteTool.description).toContain('Memory')
    expect(todoWriteTool.description).toContain('Planning')
  })

  it('execute() creates todos via the tool definition', async () => {
    const result = await todoWriteTool.execute(
      { todos: [{ content: 'Via tool' }] },
      {},
    )

    expect(result.isError).toBe(false)
    const out = JSON.parse(result.output)
    expect(out.total).toBe(1)
    expect(out.todos[0].content).toBe('Via tool')
  })
})
