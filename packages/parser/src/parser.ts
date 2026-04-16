/**
 * Standalone parser API for SysML v2 and KerML.
 *
 * Provides a simple, stateless way to parse SysML/KerML source code
 * without needing a full language server. Uses a singleton service
 * instance for performance.
 */

import {
  createDefaultCoreModule,
  createDefaultSharedCoreModule,
  EmptyFileSystem,
  URI,
  type LangiumCoreServices,
  type LangiumDocument,
  type LangiumSharedCoreServices,
} from 'langium';
import { inject } from 'langium';
import {
  SysMLGeneratedModule,
  SysMLGeneratedSharedModule,
  KerMLGeneratedModule,
} from './generated/module.js';
import type { Namespace } from './generated/ast.js';

/* ------------------------------------------------------------------ */
/*  Public Types                                                       */
/* ------------------------------------------------------------------ */

export interface ParseResult {
  /** The root AST node (Namespace) */
  ast: Namespace;
  /** Syntax errors from the parser */
  parserErrors: ParseError[];
  /** Tokenization errors from the lexer */
  lexerErrors: ParseError[];
  /** `true` when there are no parser or lexer errors */
  success: boolean;
}

export interface ParseError {
  message: string;
  line: number;
  column: number;
  offset: number;
  length: number;
}

export interface ParsingServices {
  shared: LangiumSharedCoreServices;
  SysML: LangiumCoreServices;
  KerML: LangiumCoreServices;
}

/* ------------------------------------------------------------------ */
/*  Service Factory                                                    */
/* ------------------------------------------------------------------ */

/**
 * Create minimal SysML + KerML parsing services (no LSP dependencies).
 *
 * Both SysML and KerML languages are registered so that cross-language
 * references resolve correctly.
 */
export function createParsingServices(): ParsingServices {
  const shared = inject(
    createDefaultSharedCoreModule(EmptyFileSystem),
    SysMLGeneratedSharedModule,
  );

  const sysml = inject(
    createDefaultCoreModule({ shared }),
    SysMLGeneratedModule,
  );

  const kerml = inject(
    createDefaultCoreModule({ shared }),
    KerMLGeneratedModule,
  );

  shared.ServiceRegistry.register(sysml);
  shared.ServiceRegistry.register(kerml);

  return { shared, SysML: sysml, KerML: kerml };
}

/* ------------------------------------------------------------------ */
/*  Singleton                                                          */
/* ------------------------------------------------------------------ */

let _services: ParsingServices | undefined;

function ensureServices(): ParsingServices {
  if (!_services) {
    _services = createParsingServices();
  }
  return _services;
}

/* ------------------------------------------------------------------ */
/*  Parse Functions                                                    */
/* ------------------------------------------------------------------ */

function toParseResult(document: LangiumDocument<Namespace>): ParseResult {
  const pr = document.parseResult;
  return {
    ast: pr.value,
    parserErrors: pr.parserErrors.map((e) => ({
      message: e.message,
      line: e.token.startLine ?? 0,
      column: e.token.startColumn ?? 0,
      offset: (e.token as unknown as Record<string, unknown>).startOffset as number ?? 0,
      length: e.token.image?.length ?? e.token.tokenType.name.length,
    })),
    lexerErrors: pr.lexerErrors.map((e) => ({
      message: e.message,
      line: e.line ?? 0,
      column: e.column ?? 0,
      offset: e.offset,
      length: e.length,
    })),
    success: pr.parserErrors.length === 0 && pr.lexerErrors.length === 0,
  };
}

/**
 * Parse a SysML v2 source string.
 *
 * @example
 * ```ts
 * const result = parseSysML(`
 *   package Vehicle {
 *     part engine : Engine;
 *   }
 * `);
 * console.log(result.success);
 * ```
 */
export function parseSysML(
  source: string,
  uri = 'memory://model.sysml',
): ParseResult {
  const services = ensureServices();
  const doc = services.shared.workspace.LangiumDocumentFactory.fromString(
    source,
    URI.parse(uri),
  ) as LangiumDocument<Namespace>;
  return toParseResult(doc);
}

/**
 * Parse a KerML source string.
 */
export function parseKerML(
  source: string,
  uri = 'memory://model.kerml',
): ParseResult {
  const services = ensureServices();
  const doc = services.shared.workspace.LangiumDocumentFactory.fromString(
    source,
    URI.parse(uri),
  ) as LangiumDocument<Namespace>;
  return toParseResult(doc);
}

/**
 * Dispose the singleton parser services and free resources.
 */
export function disposeParser(): void {
  _services = undefined;
}
