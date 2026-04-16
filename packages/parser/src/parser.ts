/**
 * Standalone Langium-based parser API for SysML v2.
 * Wraps Langium services for use without an LSP connection.
 */
import {
  createDefaultCoreModule,
  createDefaultSharedCoreModule,
  EmptyFileSystem,
  type LangiumDocument,
  type LangiumCoreServices,
  type LangiumSharedCoreServices,
  type AstNode,
  URI,
  inject,
} from 'langium';
import {
  SysMLGeneratedModule,
  SysMLGeneratedSharedModule,
} from './generated/module.js';

export interface ParseResult {
  /** The raw Langium AST root node */
  ast: AstNode;
  /** Parse errors */
  parserErrors: ParseErrorInfo[];
  /** Lexer errors */
  lexerErrors: ParseErrorInfo[];
  /** Whether parsing succeeded without errors */
  success: boolean;
  /** The underlying Langium document */
  document: LangiumDocument;
}

export interface ParseErrorInfo {
  message: string;
  line: number;
  column: number;
  offset: number;
  length: number;
}

let sharedServices: LangiumSharedCoreServices | undefined;
let sysmlServices: LangiumCoreServices | undefined;

function ensureServices(): {
  shared: LangiumSharedCoreServices;
  sysml: LangiumCoreServices;
} {
  if (!sharedServices || !sysmlServices) {
    const shared = inject(
      createDefaultSharedCoreModule(EmptyFileSystem),
      SysMLGeneratedSharedModule,
    );
    const sysml = inject(
      createDefaultCoreModule({ shared }),
      SysMLGeneratedModule,
    );
    shared.ServiceRegistry.register(sysml);
    sharedServices = shared;
    sysmlServices = sysml;
  }
  return { shared: sharedServices, sysml: sysmlServices };
}

/**
 * Parse SysML source code using Langium.
 */
export function parseSysML(
  source: string,
  uri = 'memory://model.sysml',
): ParseResult {
  const { shared } = ensureServices();

  const langiumDoc = shared.workspace.LangiumDocumentFactory.fromString(
    source,
    URI.parse(uri),
  );

  const parseResult = langiumDoc.parseResult;

  const parserErrors: ParseErrorInfo[] = parseResult.parserErrors.map((e) => {
    const tok = (e as any).token;
    return {
      message: e.message,
      line: tok?.startLine ?? 0,
      column: tok?.startColumn ?? 0,
      offset: tok?.startOffset ?? 0,
      length: ((tok?.endOffset ?? 0) - (tok?.startOffset ?? 0) + 1),
    };
  });

  const lexerErrors: ParseErrorInfo[] = parseResult.lexerErrors.map((e) => ({
    message: e.message,
    line: e.line ?? 0,
    column: e.column ?? 0,
    offset: e.offset,
    length: e.length,
  }));

  return {
    ast: parseResult.value,
    parserErrors,
    lexerErrors,
    success: parserErrors.length === 0 && lexerErrors.length === 0,
    document: langiumDoc,
  };
}

/**
 * Dispose parser services and release memory.
 */
export function disposeParser(): void {
  sharedServices = undefined;
  sysmlServices = undefined;
}

