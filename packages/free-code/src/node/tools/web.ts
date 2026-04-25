/**
 * Web fetch tool for the free-code Node.js library.
 *
 * Adapted from free-code's WebFetchTool (`src/tools/WebFetchTool/`).
 * Uses the Node.js built-in `fetch` (Node 18+) or `https` module for
 * maximum portability with no additional dependencies.
 *
 * Capabilities:
 * - Fetches a URL and returns the body as text
 * - Strips HTML to plain text for better LLM consumption
 * - Caches responses in memory (15-minute TTL) to avoid duplicate requests
 * - Returns metadata: status code, byte size, duration
 */

import * as https from 'https'
import * as http from 'http'
import type { FreeCodeOptions, ToolDefinition, ToolResult } from '../types.js'

// ---------------------------------------------------------------------------
// Simple in-memory cache (mirrors WebFetchTool's LRU approach)
// ---------------------------------------------------------------------------

interface CacheEntry {
  body: string
  status: number
  statusText: string
  contentType: string
  fetchedAt: number
}

const CACHE_TTL_MS = 15 * 60 * 1000 // 15 minutes
const cache = new Map<string, CacheEntry>()

function getCached(url: string): CacheEntry | null {
  const entry = cache.get(url)
  if (!entry) return null
  if (Date.now() - entry.fetchedAt > CACHE_TTL_MS) {
    cache.delete(url)
    return null
  }
  return entry
}

// ---------------------------------------------------------------------------
// HTML → plain text (simplified version of free-code's markdown conversion)
// ---------------------------------------------------------------------------

function htmlToText(html: string): string {
  return html
    // Remove scripts and styles
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    // Convert common block elements to newlines
    .replace(/<\/?(p|div|h[1-6]|li|br|tr)[^>]*>/gi, '\n')
    // Strip remaining tags
    .replace(/<[^>]+>/g, '')
    // Decode common HTML entities
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    // Collapse excess whitespace
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
}

// ---------------------------------------------------------------------------
// Core fetch implementation
// ---------------------------------------------------------------------------

export interface WebFetchInput {
  url: string
  /** When true, strip HTML tags and return plain text. Default: true */
  stripHtml?: boolean
  /** Maximum characters to return. Default: 100_000 */
  maxChars?: number
}

export interface WebFetchOutput {
  url: string
  status: number
  statusText: string
  contentType: string
  bytes: number
  durationMs: number
  body: string
}

/**
 * Fetch a URL and return its contents.
 * Equivalent to WebFetchTool.call() in the free-code CLI.
 */
export async function webFetch(
  input: WebFetchInput,
  _options: FreeCodeOptions = {},
): Promise<ToolResult> {
  const { url, stripHtml = true, maxChars = 100_000 } = input

  // Check cache
  const cached = getCached(url)
  if (cached) {
    let body = cached.contentType.includes('html') && stripHtml
      ? htmlToText(cached.body)
      : cached.body
    if (body.length > maxChars) body = body.slice(0, maxChars) + '\n...[truncated]'
    return {
      output: JSON.stringify({
        url,
        status: cached.status,
        statusText: cached.statusText,
        contentType: cached.contentType,
        bytes: cached.body.length,
        durationMs: 0,
        body,
      } satisfies WebFetchOutput),
      isError: false,
    }
  }

  const start = Date.now()
  let rawBody = ''
  let status = 0
  let statusText = ''
  let contentType = ''

  // Use native fetch if available (Node 18+), otherwise fall back to http/https
  if (typeof globalThis.fetch === 'function') {
    let response: Response
    try {
      response = await globalThis.fetch(url, {
        headers: { 'User-Agent': 'free-code/1.0 (Node.js)' },
        signal: AbortSignal.timeout(30_000),
      })
    } catch (err: unknown) {
      return { output: `Fetch error: ${(err as Error).message}`, isError: true }
    }
    status = response.status
    statusText = response.statusText
    contentType = response.headers.get('content-type') ?? ''
    rawBody = await response.text()
  } else {
    // Fallback: Node.js http/https module
    try {
      rawBody = await new Promise<string>((resolve, reject) => {
        const parsedUrl = new URL(url)
        const lib = parsedUrl.protocol === 'https:' ? https : http
        const req = lib.get(url, { headers: { 'User-Agent': 'free-code/1.0 (Node.js)' } }, res => {
          status = res.statusCode ?? 0
          statusText = res.statusMessage ?? ''
          contentType = (res.headers['content-type'] as string) ?? ''
          const chunks: Buffer[] = []
          res.on('data', (chunk: Buffer) => chunks.push(chunk))
          res.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')))
          res.on('error', reject)
        })
        req.on('error', reject)
        req.setTimeout(30_000, () => {
          req.destroy(new Error('Request timeout'))
        })
      })
    } catch (err: unknown) {
      return { output: `Fetch error: ${(err as Error).message}`, isError: true }
    }
  }

  const durationMs = Date.now() - start

  // Cache the raw body
  cache.set(url, {
    body: rawBody,
    status,
    statusText,
    contentType,
    fetchedAt: Date.now(),
  })

  // Process body
  let body = contentType.includes('html') && stripHtml ? htmlToText(rawBody) : rawBody
  if (body.length > maxChars) body = body.slice(0, maxChars) + '\n...[truncated]'

  const out: WebFetchOutput = {
    url,
    status,
    statusText,
    contentType,
    bytes: rawBody.length,
    durationMs,
    body,
  }

  if (status >= 400) {
    return { output: JSON.stringify(out), isError: true }
  }

  return { output: JSON.stringify(out), isError: false }
}

/** Clears the internal fetch cache (useful in tests) */
export function clearWebFetchCache(): void {
  cache.clear()
}

// ---------------------------------------------------------------------------
// ToolDefinition
// ---------------------------------------------------------------------------

export const webFetchTool: ToolDefinition = {
  name: 'WebFetch',
  description:
    'Fetches the content of a URL and returns it as text. ' +
    'Automatically strips HTML to plain text for easier reading. ' +
    'Caches responses for 15 minutes to avoid duplicate requests. ' +
    'Adapted from free-code\'s WebFetchTool (`src/tools/WebFetchTool/`).',
  inputSchema: {
    type: 'object',
    properties: {
      url: {
        type: 'string',
        description: 'The URL to fetch (must start with http:// or https://).',
      },
      stripHtml: {
        type: 'boolean',
        description: 'Strip HTML tags and return plain text. Default: true.',
      },
      maxChars: {
        type: 'number',
        description: 'Maximum characters to return. Default: 100000.',
      },
    },
    required: ['url'],
  },
  execute(input, options) {
    return webFetch(input as WebFetchInput, options)
  },
}
