/**
 * Tests for the WebFetch tool.
 *
 * Mocks globalThis.fetch to avoid real network calls.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import {
  webFetch,
  clearWebFetchCache,
  webFetchTool,
} from '../tools/web.js'
import type { WebFetchOutput } from '../tools/web.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockFetch(
  body: string,
  {
    status = 200,
    statusText = 'OK',
    contentType = 'text/plain',
  }: { status?: number; statusText?: string; contentType?: string } = {},
) {
  const mockResponse = {
    ok: status < 400,
    status,
    statusText,
    headers: {
      get: (name: string) => (name === 'content-type' ? contentType : null),
    },
    text: vi.fn().mockResolvedValue(body),
  }
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse))
  return mockResponse
}

function clearFetchMock() {
  vi.unstubAllGlobals()
}

// ---------------------------------------------------------------------------
// webFetch tests
// ---------------------------------------------------------------------------

describe('webFetch', () => {
  beforeEach(() => {
    clearWebFetchCache()
    clearFetchMock()
  })
  afterEach(() => {
    clearWebFetchCache()
    clearFetchMock()
  })

  it('fetches a plain text URL successfully', async () => {
    mockFetch('Hello World', { contentType: 'text/plain' })

    const result = await webFetch({ url: 'https://example.com/hello' })

    expect(result.isError).toBe(false)
    const out = JSON.parse(result.output) as WebFetchOutput
    expect(out.url).toBe('https://example.com/hello')
    expect(out.status).toBe(200)
    expect(out.body).toBe('Hello World')
  })

  it('strips HTML to plain text by default', async () => {
    mockFetch(
      '<html><head><style>body{}</style></head><body><h1>Title</h1><p>Hello <b>World</b></p></body></html>',
      { contentType: 'text/html' },
    )

    const result = await webFetch({ url: 'https://example.com' })

    expect(result.isError).toBe(false)
    const out = JSON.parse(result.output) as WebFetchOutput
    expect(out.body).toContain('Title')
    expect(out.body).toContain('Hello')
    expect(out.body).not.toContain('<h1>')
    expect(out.body).not.toContain('<p>')
    expect(out.body).not.toContain('body{}') // style removed
  })

  it('preserves HTML when stripHtml=false', async () => {
    mockFetch('<p>Hello</p>', { contentType: 'text/html' })

    const result = await webFetch({ url: 'https://example.com', stripHtml: false })

    expect(result.isError).toBe(false)
    const out = JSON.parse(result.output) as WebFetchOutput
    expect(out.body).toBe('<p>Hello</p>')
  })

  it('returns isError=true for 4xx responses', async () => {
    mockFetch('Not Found', { status: 404, statusText: 'Not Found' })

    const result = await webFetch({ url: 'https://example.com/missing' })

    expect(result.isError).toBe(true)
    const out = JSON.parse(result.output) as WebFetchOutput
    expect(out.status).toBe(404)
  })

  it('returns isError=true for 5xx responses', async () => {
    mockFetch('Internal Server Error', { status: 500, statusText: 'Internal Server Error' })

    const result = await webFetch({ url: 'https://example.com/error' })

    expect(result.isError).toBe(true)
    const out = JSON.parse(result.output) as WebFetchOutput
    expect(out.status).toBe(500)
  })

  it('truncates body when it exceeds maxChars', async () => {
    const longBody = 'a'.repeat(200_000)
    mockFetch(longBody)

    const result = await webFetch({ url: 'https://example.com', maxChars: 1000 })

    expect(result.isError).toBe(false)
    const out = JSON.parse(result.output) as WebFetchOutput
    expect(out.body.length).toBeLessThan(1100) // 1000 + truncation notice
    expect(out.body).toContain('[truncated]')
  })

  it('caches responses and returns cached result on second call', async () => {
    mockFetch('Cached content')

    await webFetch({ url: 'https://example.com/cached' })
    await webFetch({ url: 'https://example.com/cached' })

    // fetch should only be called once (second call uses cache)
    expect(globalThis.fetch).toHaveBeenCalledTimes(1)
  })

  it('clears the cache when clearWebFetchCache is called', async () => {
    mockFetch('First content')
    await webFetch({ url: 'https://example.com/clear-test' })

    clearWebFetchCache()

    mockFetch('Second content')
    const result = await webFetch({ url: 'https://example.com/clear-test' })
    const out = JSON.parse(result.output) as WebFetchOutput
    expect(out.body).toBe('Second content')
    // fetch was called twice (once before clear, once after)
    expect(globalThis.fetch).toHaveBeenCalledTimes(1) // Only this mock's call
  })

  it('returns error when fetch throws', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')))

    const result = await webFetch({ url: 'https://example.com' })

    expect(result.isError).toBe(true)
    expect(result.output).toContain('Network error')
  })

  it('decodes HTML entities in stripped content', async () => {
    mockFetch('<p>Tom &amp; Jerry &lt;3</p>', { contentType: 'text/html' })

    const result = await webFetch({ url: 'https://example.com/entities' })

    expect(result.isError).toBe(false)
    const out = JSON.parse(result.output) as WebFetchOutput
    expect(out.body).toContain('Tom & Jerry <3')
  })

  it('includes metadata in the output (url, status, durationMs, bytes)', async () => {
    mockFetch('Some content')

    const result = await webFetch({ url: 'https://example.com/meta' })

    expect(result.isError).toBe(false)
    const out = JSON.parse(result.output) as WebFetchOutput
    expect(out.url).toBe('https://example.com/meta')
    expect(out.status).toBe(200)
    expect(typeof out.durationMs).toBe('number')
    expect(typeof out.bytes).toBe('number')
  })
})

// ---------------------------------------------------------------------------
// webFetchTool (ToolDefinition wrapper)
// ---------------------------------------------------------------------------

describe('webFetchTool', () => {
  beforeEach(() => {
    clearWebFetchCache()
    clearFetchMock()
  })
  afterEach(() => {
    clearWebFetchCache()
    clearFetchMock()
  })

  it('has the correct name and description', () => {
    expect(webFetchTool.name).toBe('WebFetch')
    expect(webFetchTool.description).toContain('WebFetchTool')
  })

  it('has a valid input schema with required url', () => {
    expect(webFetchTool.inputSchema.required).toContain('url')
    expect(webFetchTool.inputSchema.properties.url).toBeDefined()
  })

  it('execute() delegates to webFetch()', async () => {
    mockFetch('Tool execute test')

    const result = await webFetchTool.execute({ url: 'https://example.com/tool' }, {})

    expect(result.isError).toBe(false)
    const out = JSON.parse(result.output) as WebFetchOutput
    expect(out.body).toBe('Tool execute test')
  })
})
