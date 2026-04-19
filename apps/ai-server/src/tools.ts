/**
 * SysML v2 Validation Tool
 *
 * Uses the @easy-sysml/language-server to parse and validate SysML v2 code.
 * Provides syntax checking and diagnostic information for AI-generated code.
 */

import { NodeFileSystem } from 'langium/node';
import { createSysMLServices, loadStdlib } from '@easy-sysml/language-server';
import { URI, type LangiumDocument } from 'langium';

export interface ValidationResult {
  valid: boolean;
  diagnostics: Array<{
    severity: 'error' | 'warning' | 'info' | 'hint';
    message: string;
    line: number;
    column: number;
  }>;
  summary: string;
}

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

/**
 * Validate SysML v2 code using the language server.
 */
export async function validateSysML(code: string): Promise<ValidationResult> {
  const services = await ensureServices();
  const shared = services.shared;

  // Create a virtual document
  const uri = URI.parse('inmemory:///ai-validation.sysml');
  const langiumDocuments = shared.workspace.LangiumDocuments;
  const documentFactory = shared.workspace.LangiumDocumentFactory;
  const documentBuilder = shared.workspace.DocumentBuilder;

  // Remove existing document if present
  if (langiumDocuments.hasDocument(uri)) {
    const existing = langiumDocuments.getDocument(uri)!;
    await documentBuilder.update([uri], []);
    try { langiumDocuments.deleteDocument(uri); } catch { /* ignore */ }
    // Try again
    if (langiumDocuments.hasDocument(uri)) {
      // Can't delete — just update content
      const doc = langiumDocuments.getDocument(uri)!;
      (doc as any).textDocument = {
        ...(doc as any).textDocument,
        getText: () => code,
        version: ((doc as any).textDocument?.version ?? 0) + 1,
      };
    }
  }

  let document: LangiumDocument;
  if (langiumDocuments.hasDocument(uri)) {
    document = langiumDocuments.getDocument(uri)!;
  } else {
    document = documentFactory.fromString(code, uri);
    langiumDocuments.addDocument(document);
  }

  // Build the document (parse + link + validate)
  try {
    await documentBuilder.build([document], { validation: true });
  } catch {
    // Build may throw on severe syntax errors — still check diagnostics
  }

  const rawDiagnostics = document.diagnostics ?? [];

  const diagnostics = rawDiagnostics.map((d: any) => ({
    severity: d.severity === 1 ? 'error' as const
      : d.severity === 2 ? 'warning' as const
      : d.severity === 3 ? 'info' as const
      : 'hint' as const,
    message: d.message,
    line: (d.range?.start?.line ?? 0) + 1,
    column: (d.range?.start?.character ?? 0) + 1,
  }));

  const errors = diagnostics.filter(d => d.severity === 'error');
  const warnings = diagnostics.filter(d => d.severity === 'warning');

  let summary: string;
  if (errors.length === 0 && warnings.length === 0) {
    summary = '✅ 代码语法正确，无错误和警告';
  } else if (errors.length === 0) {
    summary = `⚠️ 无语法错误，但有 ${warnings.length} 个警告`;
  } else {
    summary = `❌ 发现 ${errors.length} 个语法错误` +
      (warnings.length > 0 ? ` 和 ${warnings.length} 个警告` : '');
  }

  // Clean up document
  try {
    await documentBuilder.update([], [uri]);
    langiumDocuments.deleteDocument(uri);
  } catch { /* ignore cleanup errors */ }

  return {
    valid: errors.length === 0,
    diagnostics,
    summary,
  };
}

/**
 * Get available standard library type names for a given category.
 */
export async function getStdlibTypes(category?: string): Promise<string[]> {
  const { getStdlibFiles } = await import('@easy-sysml/language-server');
  const files = getStdlibFiles();

  if (!category) {
    return files;
  }

  const lower = category.toLowerCase();
  return files.filter((f: string) => f.toLowerCase().includes(lower));
}
