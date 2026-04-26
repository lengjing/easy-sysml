/**
 * Tests for apps/ai-server/src/index.ts HTTP endpoints.
 *
 * Uses `supertest` to exercise the Express routes without starting a real port.
 * All AI model calls are mocked — no real API keys are needed.
 *
 * Endpoints tested:
 *   GET  /api/status
 *   POST /api/chat   (SSE)
 *   POST /api/validate
 *   GET  /api/stdlib
 */

import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import request from 'supertest';

/* ------------------------------------------------------------------ */
/*  Top-level mocks (hoisted by vitest)                               */
/* ------------------------------------------------------------------ */

// Mock the agent module — individual tests override runAgent implementation
vi.mock('../agent.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../agent.js')>();
  return {
    ...actual,
    runAgent: vi.fn(async function* () {
      yield { type: 'delta', content: 'Hello from agent' };
      yield { type: 'done' };
    }),
  };
});

// Mock tools to avoid real Langium initialization
vi.mock('../tools.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../tools.js')>();
  return {
    ...actual,
    validateSysML: vi.fn().mockResolvedValue({
      valid: true,
      diagnostics: [],
      summary: 'Code is valid — no errors or warnings.',
    }),
    mcpTools: {
      validate_sysml: { description: 'Validate SysML', inputSchema: {} },
      get_stdlib_types: { description: 'Get stdlib', inputSchema: {} },
    },
  };
});

// Mock @easy-sysml/language-server
vi.mock('@easy-sysml/language-server', () => ({
  getStdlibFiles: vi.fn().mockReturnValue(['Base.sysml', 'Parts.sysml', 'Ports.sysml']),
  createSysMLServices: vi.fn(),
  loadStdlib: vi.fn().mockResolvedValue(undefined),
}));

/* ------------------------------------------------------------------ */
/*  Environment setup                                                 */
/* ------------------------------------------------------------------ */

beforeAll(() => {
  process.env.AI_PROVIDER = 'gemini';
  process.env.GEMINI_API_KEY = 'test-key-server';
});

afterAll(() => {
  delete process.env.AI_PROVIDER;
  delete process.env.GEMINI_API_KEY;
});

/* ------------------------------------------------------------------ */
/*  GET /api/status                                                   */
/* ------------------------------------------------------------------ */

describe('GET /api/status', () => {
  it('returns 200 with provider info', async () => {
    const { app } = await import('../index.js');
    const res = await request(app).get('/api/status');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.provider).toBe('gemini');
    expect(res.body.configured).toBe(true);
    expect(res.body.wsEndpoint).toBe('/api/ws');
  });

  it('reports correct model', async () => {
    const { app } = await import('../index.js');
    const res = await request(app).get('/api/status');
    expect(res.body.model).toBeTruthy();
  });
});

/* ------------------------------------------------------------------ */
/*  POST /api/chat — SSE                                              */
/* ------------------------------------------------------------------ */

describe('POST /api/chat', () => {
  it('returns 400 when messages is missing', async () => {
    const { app } = await import('../index.js');
    const res = await request(app).post('/api/chat').send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBeTruthy();
  });

  it('returns 400 when messages is empty array', async () => {
    const { app } = await import('../index.js');
    const res = await request(app).post('/api/chat').send({ messages: [] });
    expect(res.status).toBe(400);
  });

  it('returns 400 when messages is not an array', async () => {
    const { app } = await import('../index.js');
    const res = await request(app).post('/api/chat').send({ messages: 'hello' });
    expect(res.status).toBe(400);
  });

  it('returns SSE stream with done event on success', async () => {
    const { app } = await import('../index.js');
    const res = await request(app)
      .post('/api/chat')
      .set('Accept', 'text/event-stream')
      .send({ messages: [{ role: 'user', content: 'hi' }] });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/event-stream');
    expect(res.text).toContain('event: delta');
    expect(res.text).toContain('event: done');
  });

  it('emits SSE error event when runAgent throws', async () => {
    const agentModule = await import('../agent.js');
    vi.mocked(agentModule.runAgent).mockImplementationOnce(async function* () {
      throw new Error('Test agent error');
    });

    const { app } = await import('../index.js');
    const res = await request(app)
      .post('/api/chat')
      .set('Accept', 'text/event-stream')
      .send({ messages: [{ role: 'user', content: 'trigger error' }] });

    expect(res.status).toBe(200);
    expect(res.text).toContain('event: error');
    expect(res.text).toContain('Test agent error');
  });
});

/* ------------------------------------------------------------------ */
/*  POST /api/validate                                                */
/* ------------------------------------------------------------------ */

describe('POST /api/validate', () => {
  it('returns 400 when code is missing', async () => {
    const { app } = await import('../index.js');
    const res = await request(app).post('/api/validate').send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBeTruthy();
  });

  it('returns 400 when code is empty string', async () => {
    const { app } = await import('../index.js');
    const res = await request(app).post('/api/validate').send({ code: '   ' });
    expect(res.status).toBe(400);
  });

  it('returns validation result for valid SysML code', async () => {
    const { app } = await import('../index.js');
    const res = await request(app)
      .post('/api/validate')
      .send({ code: 'package Test {}' });

    expect(res.status).toBe(200);
    expect(res.body.valid).toBe(true);
    expect(res.body.summary).toContain('valid');
  });

  it('returns validation errors for invalid SysML code', async () => {
    const toolsModule = await import('../tools.js');
    vi.mocked(toolsModule.validateSysML).mockResolvedValueOnce({
      valid: false,
      diagnostics: [
        { severity: 'error', message: 'Unexpected token', line: 1, column: 1 },
      ],
      summary: 'Found 1 error(s).',
    });

    const { app } = await import('../index.js');
    const res = await request(app)
      .post('/api/validate')
      .send({ code: '!invalid sysml!' });

    expect(res.status).toBe(200);
    expect(res.body.valid).toBe(false);
    expect(res.body.diagnostics).toHaveLength(1);
  });
});

/* ------------------------------------------------------------------ */
/*  GET /api/stdlib                                                   */
/* ------------------------------------------------------------------ */

describe('GET /api/stdlib', () => {
  it('returns list of stdlib types', async () => {
    const { app } = await import('../index.js');
    const res = await request(app).get('/api/stdlib');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.types)).toBe(true);
    expect(res.body.types.length).toBeGreaterThan(0);
  });

  it('filters stdlib types by category query param', async () => {
    const { app } = await import('../index.js');
    const res = await request(app).get('/api/stdlib?category=Parts');
    expect(res.status).toBe(200);
    expect(res.body.types).toContain('Parts.sysml');
    expect(res.body.types).not.toContain('Base.sysml');
  });
});
