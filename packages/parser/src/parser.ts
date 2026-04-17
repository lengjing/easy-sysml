/**
 * Standalone SysML v2 Parser API
 *
 * Provides a simple function to parse SysML/KerML source code
 * without any LSP dependencies. Uses Langium under the hood.
 */

import {
  createDefaultCoreModule,
  createDefaultSharedCoreModule,
  EmptyFileSystem,
  URI,
  type LangiumDocument,
  type AstNode,
} from 'langium';
import { inject } from 'langium';
import { SysMLGeneratedModule, SysMLGeneratedSharedModule } from './generated/module.js';

/** Result of parsing SysML/KerML source code */
export interface ParseResult {
  /** The parsed AST root node */
  ast: AstNode;
  /** Parser errors (syntax errors) */
  parserErrors: ParseErrorInfo[];
  /** Lexer errors (tokenization errors) */
  lexerErrors: ParseErrorInfo[];
  /** Whether parsing was successful (no errors) */
  success: boolean;
  /** The underlying Langium document */
  document: LangiumDocument;
}

/** Information about a parse error */
export interface ParseErrorInfo {
  message: string;
  line: number;
  column: number;
  offset: number;
  length: number;
}

/**
 * Create minimal Langium services for standalone parsing (no LSP)
 */
function createParsingServices() {
  const shared = inject(
    createDefaultSharedCoreModule(EmptyFileSystem),
    SysMLGeneratedSharedModule,
  );

  const sysml = inject(
    createDefaultCoreModule({ shared }),
    SysMLGeneratedModule,
  );

  shared.ServiceRegistry.register(sysml);
  return { shared, sysml };
}

// Singleton services instance
let services: ReturnType<typeof createParsingServices> | undefined;

function ensureServices() {
  if (!services) {
    services = createParsingServices();
  }
  return services;
}

/**
 * Parse SysML source code into an AST.
 *
 * @param source - SysML/KerML source code string
 * @param uri - Optional document URI (must use triple-slash for extension detection, e.g. `memory:///model.sysml`)
 * @returns ParseResult with AST and error information
 *
 * @example
 * ```typescript
 * import { parseSysML } from '@easy-sysml/parser';
 *
 * const result = parseSysML(`
 *   package MySystem {
 *     part vehicle : Vehicle;
 *   }
 * `);
 *
 * if (result.success) {
 *   console.log('Parsed successfully');
 * }
 * ```
 */
export function parseSysML(
  source: string,
  uri: string = 'memory:///model.sysml',
): ParseResult {
  const { shared } = ensureServices();

  const document = shared.workspace.LangiumDocumentFactory.fromString(
    source,
    URI.parse(uri),
  );

  const parseResult = document.parseResult;

  return {
    ast: parseResult.value,
    parserErrors: parseResult.parserErrors.map((e) => ({
      message: e.message,
      line: e.token.startLine ?? 0,
      column: e.token.startColumn ?? 0,
      offset: (e.token as unknown as Record<string, unknown>)['startOffset'] as number ?? 0,
      length: e.token.image?.length ?? e.token.tokenType?.name?.length ?? 0,
    })),
    lexerErrors: parseResult.lexerErrors.map((e) => ({
      message: e.message,
      line: e.line ?? 0,
      column: e.column ?? 0,
      offset: e.offset,
      length: e.length,
    })),
    success:
      parseResult.parserErrors.length === 0 &&
      parseResult.lexerErrors.length === 0,
    document,
  };
}

/**
 * Dispose parser services and free resources.
 * Call this when done parsing to allow garbage collection.
 */
export function disposeParser(): void {
  services = undefined;
}
