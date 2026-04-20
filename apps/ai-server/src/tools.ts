/**
 * SysML v2 MCP Tools
 *
 * MCP-style tool definitions using Vercel AI SDK `tool()` with Zod schemas.
 * These tools are passed to the AI model via the `tools` parameter, enabling
 * proper function-calling / tool-use via the model's native tool API.
 *
 * Tools:
 *   validate_sysml   — Parse and validate SysML v2 code using the real parser
 *   get_stdlib_types  — Query the SysML v2 standard library
 */

import { tool } from 'ai';
import { z } from 'zod';
import { NodeFileSystem } from 'langium/node';
import { createSysMLServices, loadStdlib } from '@easy-sysml/language-server';
import { URI, type LangiumDocument } from 'langium';

/* ------------------------------------------------------------------ */
/*  Langium service singleton                                         */
/* ------------------------------------------------------------------ */

let _services: ReturnType<typeof createSysMLServices> | null = null;
let _stdlibLoaded = false;
let _initPromise: Promise<void> | null = null;

/**
 * Suppress Chevrotain "Ambiguous Alternatives Detected" warnings.
 */
function suppressChevrotainWarnings<T>(fn: () => T): T {
  const originalLog = console.log;
  console.log = (...args: unknown[]) => {
    const msg = String(args[0] || '');
    if (
      msg.includes('Ambiguous Alternatives Detected') ||
      msg.includes('may appears as a prefix path') ||
      msg.includes('AMBIGUOUS_ALTERNATIVES')
    ) {
      return;
    }
    originalLog.apply(console, args);
  };
  try {
    return fn();
  } finally {
    console.log = originalLog;
  }
}

async function ensureServices(): Promise<ReturnType<typeof createSysMLServices>> {
  if (_services) {
    if (!_stdlibLoaded && !_initPromise) {
      _initPromise = loadStdlib(_services.shared, { verbose: false })
        .then(() => { _stdlibLoaded = true; })
        .catch((err: unknown) => {
          console.warn('[SysML Tools] stdlib load warning:', err);
        })
        .finally(() => { _initPromise = null; });
    }
    if (_initPromise) await _initPromise;
    return _services;
  }

  _services = suppressChevrotainWarnings(() =>
    createSysMLServices({ ...NodeFileSystem }),
  );

  // Load stdlib in background
  _initPromise = loadStdlib(_services.shared, { verbose: false })
    .then(() => {
      _stdlibLoaded = true;
      console.log('[SysML Tools] Standard library loaded');
    })
    .catch((err: unknown) => {
      console.warn('[SysML Tools] stdlib load warning:', err);
    })
    .finally(() => { _initPromise = null; });

  await _initPromise;
  return _services;
}

/* ------------------------------------------------------------------ */
/*  Core validation logic                                             */
/* ------------------------------------------------------------------ */

interface ValidationResult {
  valid: boolean;
  diagnostics: Array<{
    severity: 'error' | 'warning' | 'info' | 'hint';
    message: string;
    line: number;
    column: number;
  }>;
  summary: string;
}

async function runValidation(code: string): Promise<ValidationResult> {
  const services = await ensureServices();
  const shared = services.shared;

  const uri = URI.parse('inmemory:///ai-validation.sysml');
  const langiumDocuments = shared.workspace.LangiumDocuments;
  const documentFactory = shared.workspace.LangiumDocumentFactory;
  const documentBuilder = shared.workspace.DocumentBuilder;

  // Remove existing document if present
  if (langiumDocuments.hasDocument(uri)) {
    await documentBuilder.update([uri], []);
    try { langiumDocuments.deleteDocument(uri); } catch { /* ignore */ }
    if (langiumDocuments.hasDocument(uri)) {
      const doc = langiumDocuments.getDocument(uri)!;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const docAny = doc as any;
      const textDoc = docAny.textDocument;
      if (textDoc) {
        const prevVersion = (textDoc.version ?? 0) as number;
        docAny.textDocument = {
          ...textDoc,
          getText: () => code,
          version: prevVersion + 1,
        };
      }
    }
  }

  let document: LangiumDocument;
  if (langiumDocuments.hasDocument(uri)) {
    document = langiumDocuments.getDocument(uri)!;
  } else {
    document = documentFactory.fromString(code, uri);
    langiumDocuments.addDocument(document);
  }

  try {
    await documentBuilder.build([document], { validation: true });
  } catch {
    // Build may throw on severe syntax errors — still check diagnostics
  }

  const rawDiagnostics = document.diagnostics ?? [];

  const diagnostics = rawDiagnostics.map((d) => ({
    severity: (d as Record<string, unknown>).severity === 1 ? 'error' as const
      : (d as Record<string, unknown>).severity === 2 ? 'warning' as const
      : (d as Record<string, unknown>).severity === 3 ? 'info' as const
      : 'hint' as const,
    message: d.message,
    line: (d.range?.start?.line ?? 0) + 1,
    column: (d.range?.start?.character ?? 0) + 1,
  }));

  const errors = diagnostics.filter(d => d.severity === 'error');
  const warnings = diagnostics.filter(d => d.severity === 'warning');

  let summary: string;
  if (errors.length === 0 && warnings.length === 0) {
    summary = 'Code is valid — no errors or warnings.';
  } else if (errors.length === 0) {
    summary = `No errors, but ${warnings.length} warning(s).`;
  } else {
    summary = `Found ${errors.length} error(s)` +
      (warnings.length > 0 ? ` and ${warnings.length} warning(s)` : '') + '.';
  }

  // Clean up
  try {
    await documentBuilder.update([], [uri]);
    langiumDocuments.deleteDocument(uri);
  } catch { /* ignore cleanup errors */ }

  return { valid: errors.length === 0, diagnostics, summary };
}

/* ------------------------------------------------------------------ */
/*  MCP Tool definitions (Vercel AI SDK `tool()`)                     */
/* ------------------------------------------------------------------ */

/**
 * MCP tool: validate_sysml
 *
 * Validates SysML v2 code using the real Langium-based parser.
 * Returns structured diagnostics with line/column info.
 */
export const validateSysmlTool = tool({
  description:
    'Validate SysML v2 code for syntax and semantic correctness using the real SysML v2 parser. ' +
    'Call this tool AFTER generating SysML code to verify it is correct. ' +
    'If errors are found, fix the code and call this tool again.',
  inputSchema: z.object({
    code: z.string().describe('The SysML v2 source code to validate'),
  }),
  execute: async ({ code }) => {
    const result = await runValidation(code);
    return {
      valid: result.valid,
      summary: result.summary,
      errors: result.diagnostics
        .filter(d => d.severity === 'error')
        .map(d => `Line ${d.line}:${d.column}: ${d.message}`),
      warnings: result.diagnostics
        .filter(d => d.severity === 'warning')
        .map(d => `Line ${d.line}:${d.column}: ${d.message}`),
    };
  },
});

/**
 * MCP tool: get_stdlib_types
 *
 * Queries the SysML v2 standard library for available type definitions.
 */
export const getStdlibTypesTool = tool({
  description:
    'Query the SysML v2 standard library to find available types and definitions. ' +
    'Use this to discover what standard types exist (e.g., Part, Port, Action, etc.) ' +
    'and their relationships. Provide an optional category filter.',
  inputSchema: z.object({
    category: z.string().optional().describe(
      'Optional category filter (e.g., "Base", "Parts", "Ports", "Actions", "States", "Requirements")',
    ),
  }),
  execute: async ({ category }) => {
    const { getStdlibFiles } = await import('@easy-sysml/language-server');
    const files: string[] = getStdlibFiles();

    if (!category) {
      return { files, count: files.length };
    }

    const lower = category.toLowerCase();
    const filtered = files.filter((f: string) => f.toLowerCase().includes(lower));
    return { files: filtered, count: filtered.length, filter: category };
  },
});

/**
 * All MCP tools available to the agent, keyed by name.
 */
export const mcpTools = {
  validate_sysml: validateSysmlTool,
  get_stdlib_types: getStdlibTypesTool,
};

/* ------------------------------------------------------------------ */
/*  Direct validation (for REST endpoints)                            */
/* ------------------------------------------------------------------ */

export { runValidation as validateSysML };
