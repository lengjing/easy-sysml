/**
 * SysML Language Service
 *
 * Wraps the Langium parser to provide LSP-like features
 * (diagnostics, hover, document symbols) directly in the browser
 * via custom Monaco providers.
 */
import type * as Monaco from 'monaco-editor';
import {
  type AstNode,
  CstUtils,
  EmptyFileSystem,
  URI,
  type LangiumDocument,
} from 'langium';
import {
  createDefaultCoreModule,
  createDefaultSharedCoreModule,
} from 'langium';
import { inject } from 'langium';
import {
  SysMLGeneratedModule,
  SysMLGeneratedSharedModule,
} from '@easy-sysml/parser';
import { SYSML_LANGUAGE_ID } from './sysml-language';

/* ------------------------------------------------------------------ */
/*  Langium services (singleton)                                      */
/* ------------------------------------------------------------------ */

function createBrowserServices() {
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

let _services: ReturnType<typeof createBrowserServices> | undefined;

function getServices() {
  if (!_services) {
    _services = createBrowserServices();
  }
  return _services;
}

/* ------------------------------------------------------------------ */
/*  Diagnostics                                                       */
/* ------------------------------------------------------------------ */

export interface DiagnosticInfo {
  message: string;
  startLineNumber: number;
  startColumn: number;
  endLineNumber: number;
  endColumn: number;
  severity: 'error' | 'warning' | 'info';
}

/**
 * Parse source and return diagnostics suitable for Monaco markers.
 */
export function getDiagnostics(source: string): DiagnosticInfo[] {
  const { shared } = getServices();
  const doc = shared.workspace.LangiumDocumentFactory.fromString(
    source,
    URI.parse('memory:///model.sysml'),
  );

  const diagnostics: DiagnosticInfo[] = [];

  for (const err of doc.parseResult.parserErrors) {
    const startLine = Number.isFinite(err.token.startLine) ? err.token.startLine! : 1;
    const startCol = Number.isFinite(err.token.startColumn) ? err.token.startColumn! : 1;
    const endLine = Number.isFinite(err.token.endLine) ? err.token.endLine! : startLine;
    const endCol = Number.isFinite(err.token.endColumn) ? err.token.endColumn! : startCol;
    diagnostics.push({
      message: err.message,
      startLineNumber: startLine,
      startColumn: startCol,
      endLineNumber: endLine,
      endColumn: endCol + 1,
      severity: 'error',
    });
  }

  for (const err of doc.parseResult.lexerErrors) {
    diagnostics.push({
      message: err.message,
      startLineNumber: err.line ?? 1,
      startColumn: err.column ?? 1,
      endLineNumber: err.line ?? 1,
      endColumn: (err.column ?? 1) + (err.length ?? 1),
      severity: 'error',
    });
  }

  return diagnostics;
}

/* ------------------------------------------------------------------ */
/*  Hover                                                             */
/* ------------------------------------------------------------------ */

function getNodeName(node: AstNode): string | undefined {
  const n = node as unknown as Record<string, unknown>;
  for (const prop of ['declaredName', 'name', 'shortName']) {
    if (typeof n[prop] === 'string' && (n[prop] as string).length > 0) {
      return n[prop] as string;
    }
  }
  return undefined;
}

function buildHoverMarkdown(node: AstNode): string | undefined {
  const nodeType = node.$type || 'Unknown';
  const name = getNodeName(node);
  const lines: string[] = [];

  if (name) {
    lines.push(`**${name}**`, '');
  }
  lines.push(`*Type:* \`${nodeType}\``);

  const n = node as unknown as Record<string, unknown>;
  const info: string[] = [];
  if (n['visibility']) info.push(`Visibility: ${n['visibility']}`);
  if (n['isAbstract']) info.push('Abstract');
  if (n['isSufficient']) info.push('Sufficient');

  const container = node.$container;
  if (container) {
    const containerName = getNodeName(container);
    if (containerName) info.push(`Container: ${containerName} (${container.$type})`);
  }

  if (info.length > 0) {
    lines.push('', info.join(' • '));
  }

  return lines.length > 0 ? lines.join('\n') : undefined;
}

/**
 * Get hover information at a position.
 */
export function getHoverInfo(
  source: string,
  lineNumber: number,
  column: number,
): { contents: string; range?: { startLineNumber: number; startColumn: number; endLineNumber: number; endColumn: number } } | undefined {
  const { shared } = getServices();
  const doc = shared.workspace.LangiumDocumentFactory.fromString(
    source,
    URI.parse('memory:///model.sysml'),
  );

  const rootCst = doc.parseResult.value.$cstNode;
  if (!rootCst) return undefined;

  // Convert Monaco 1-based position to Langium offset
  const lines = source.split('\n');
  let offset = 0;
  for (let i = 0; i < lineNumber - 1 && i < lines.length; i++) {
    offset += lines[i].length + 1; // +1 for newline
  }
  offset += column - 1;

  const leaf = CstUtils.findLeafNodeAtOffset(rootCst, offset);
  if (!leaf?.astNode) return undefined;

  const md = buildHoverMarkdown(leaf.astNode);
  if (!md) return undefined;

  return { contents: md };
}

/* ------------------------------------------------------------------ */
/*  Document Symbols                                                  */
/* ------------------------------------------------------------------ */

export interface SymbolInfo {
  name: string;
  kind: string;
  range: {
    startLineNumber: number;
    startColumn: number;
    endLineNumber: number;
    endColumn: number;
  };
  children: SymbolInfo[];
}

function collectSymbols(node: AstNode, source: string, visited = new Set<AstNode>()): SymbolInfo[] {
  if (visited.has(node)) return [];
  visited.add(node);

  const symbols: SymbolInfo[] = [];
  const name = getNodeName(node);

  // Helper: recurse into child AST nodes (only non-$ properties)
  function getChildSymbols(): SymbolInfo[] {
    const children: SymbolInfo[] = [];
    const content = node as unknown as Record<string, unknown>;
    for (const [key, val] of Object.entries(content)) {
      if (key.startsWith('$')) continue;
      if (Array.isArray(val)) {
        for (const item of val) {
          if (item && typeof item === 'object' && '$type' in item && !visited.has(item as AstNode)) {
            children.push(...collectSymbols(item as AstNode, source, visited));
          }
        }
      } else if (val && typeof val === 'object' && '$type' in val && !visited.has(val as AstNode)) {
        children.push(...collectSymbols(val as AstNode, source, visited));
      }
    }
    return children;
  }

  if (name && node.$cstNode) {
    const startOffset = node.$cstNode.offset;
    const endOffset = node.$cstNode.end;
    const startPos = offsetToPosition(source, startOffset);
    const endPos = offsetToPosition(source, endOffset);

    symbols.push({
      name,
      kind: node.$type,
      range: {
        startLineNumber: startPos.line,
        startColumn: startPos.column,
        endLineNumber: endPos.line,
        endColumn: endPos.column,
      },
      children: getChildSymbols(),
    });
  } else {
    symbols.push(...getChildSymbols());
  }

  return symbols;
}

function offsetToPosition(source: string, offset: number): { line: number; column: number } {
  let line = 1;
  let column = 1;
  for (let i = 0; i < offset && i < source.length; i++) {
    if (source[i] === '\n') {
      line++;
      column = 1;
    } else {
      column++;
    }
  }
  return { line, column };
}

/**
 * Get document symbols for the outline view.
 */
export function getDocumentSymbols(source: string): SymbolInfo[] {
  const { shared } = getServices();
  const doc = shared.workspace.LangiumDocumentFactory.fromString(
    source,
    URI.parse('memory:///model.sysml'),
  );
  return collectSymbols(doc.parseResult.value, source);
}

/* ------------------------------------------------------------------ */
/*  Completion                                                        */
/* ------------------------------------------------------------------ */

const SYSML_KEYWORDS = [
  'package', 'part', 'port', 'action', 'state', 'item', 'attribute',
  'connection', 'interface', 'allocation', 'requirement', 'constraint',
  'concern', 'case', 'analysis', 'verification', 'use', 'view',
  'viewpoint', 'rendering', 'metadata', 'def', 'abstract', 'import',
  'comment', 'doc', 'about', 'specializes', 'subsets', 'redefines',
  'references', 'in', 'out', 'inout', 'ref', 'block', 'feature',
  'type', 'class', 'datatype', 'struct', 'assoc', 'connector',
  'binding', 'step', 'expr', 'function', 'predicate', 'interaction',
  'behavior', 'calculation', 'flow', 'succession', 'transition',
  'if', 'then', 'else', 'while', 'until', 'loop', 'for',
  'true', 'false', 'null',
];

/**
 * Get completion suggestions for a position.
 */
export function getCompletions(
  source: string,
  lineNumber: number,
  column: number,
): Array<{ label: string; kind: 'keyword' | 'snippet' | 'text'; insertText: string; detail?: string }> {
  // Extract the word being typed
  const lines = source.split('\n');
  const line = lines[lineNumber - 1] || '';
  const textBefore = line.substring(0, column - 1);
  const wordMatch = textBefore.match(/[a-zA-Z_]\w*$/);
  const prefix = wordMatch ? wordMatch[0].toLowerCase() : '';

  const suggestions: Array<{ label: string; kind: 'keyword' | 'snippet' | 'text'; insertText: string; detail?: string }> = [];

  // Keyword completions
  for (const kw of SYSML_KEYWORDS) {
    if (prefix.length === 0 || kw.startsWith(prefix)) {
      suggestions.push({
        label: kw,
        kind: 'keyword',
        insertText: kw,
        detail: 'SysML keyword',
      });
    }
  }

  // Snippet completions
  if (prefix.length === 0 || 'package'.startsWith(prefix)) {
    suggestions.push({
      label: 'package (block)',
      kind: 'snippet',
      insertText: 'package ${1:Name} {\n\t$0\n}',
      detail: 'Package definition',
    });
  }
  if (prefix.length === 0 || 'part'.startsWith(prefix)) {
    suggestions.push({
      label: 'part def (block)',
      kind: 'snippet',
      insertText: 'part def ${1:Name} {\n\t$0\n}',
      detail: 'Part definition',
    });
  }
  if (prefix.length === 0 || 'requirement'.startsWith(prefix)) {
    suggestions.push({
      label: 'requirement def (block)',
      kind: 'snippet',
      insertText: 'requirement def ${1:Name} {\n\tdoc /* ${2:description} */\n}',
      detail: 'Requirement definition',
    });
  }
  if (prefix.length === 0 || 'action'.startsWith(prefix)) {
    suggestions.push({
      label: 'action def (block)',
      kind: 'snippet',
      insertText: 'action def ${1:Name} {\n\t$0\n}',
      detail: 'Action definition',
    });
  }

  // Extract identifiers from the document for local completions
  const { shared } = getServices();
  const doc = shared.workspace.LangiumDocumentFactory.fromString(
    source,
    URI.parse('memory:///model.sysml'),
  );
  const identifiers = new Set<string>();
  collectIdentifiers(doc.parseResult.value, identifiers);
  for (const id of identifiers) {
    if (prefix.length === 0 || id.toLowerCase().startsWith(prefix)) {
      suggestions.push({
        label: id,
        kind: 'text',
        insertText: id,
        detail: 'Local identifier',
      });
    }
  }

  return suggestions;
}

function collectIdentifiers(node: AstNode, ids: Set<string>, visited = new Set<AstNode>()): void {
  if (visited.has(node)) return;
  visited.add(node);

  const name = getNodeName(node);
  if (name) ids.add(name);
  const content = node as unknown as Record<string, unknown>;
  for (const [key, val] of Object.entries(content)) {
    if (key.startsWith('$')) continue;
    if (Array.isArray(val)) {
      for (const item of val) {
        if (item && typeof item === 'object' && '$type' in item && !visited.has(item as AstNode)) {
          collectIdentifiers(item as AstNode, ids, visited);
        }
      }
    } else if (val && typeof val === 'object' && '$type' in val && !visited.has(val as AstNode)) {
      collectIdentifiers(val as AstNode, ids, visited);
    }
  }
}

/* ------------------------------------------------------------------ */
/*  Go-to-definition                                                  */
/* ------------------------------------------------------------------ */

/**
 * Get definition location for an identifier at a position.
 */
export function getDefinition(
  source: string,
  lineNumber: number,
  column: number,
): { startLineNumber: number; startColumn: number; endLineNumber: number; endColumn: number } | undefined {
  const { shared } = getServices();
  const doc = shared.workspace.LangiumDocumentFactory.fromString(
    source,
    URI.parse('memory:///model.sysml'),
  );

  const rootCst = doc.parseResult.value.$cstNode;
  if (!rootCst) return undefined;

  // Convert position to offset
  const lines = source.split('\n');
  let offset = 0;
  for (let i = 0; i < lineNumber - 1 && i < lines.length; i++) {
    offset += lines[i].length + 1;
  }
  offset += column - 1;

  const leaf = CstUtils.findLeafNodeAtOffset(rootCst, offset);
  if (!leaf) return undefined;

  // Get the text at cursor
  const word = leaf.text;
  if (!word) return undefined;

  // Search for the definition of this name in the AST
  const defNode = findDefinition(doc.parseResult.value, word);
  if (!defNode?.$cstNode) return undefined;

  const startPos = offsetToPosition(source, defNode.$cstNode.offset);
  const endPos = offsetToPosition(source, defNode.$cstNode.end);

  return {
    startLineNumber: startPos.line,
    startColumn: startPos.column,
    endLineNumber: endPos.line,
    endColumn: endPos.column,
  };
}

function findDefinition(node: AstNode, name: string, visited = new Set<AstNode>()): AstNode | undefined {
  if (visited.has(node)) return undefined;
  visited.add(node);

  const nodeName = getNodeName(node);
  if (nodeName === name) return node;

  const content = node as unknown as Record<string, unknown>;
  for (const [key, val] of Object.entries(content)) {
    if (key.startsWith('$')) continue;
    if (Array.isArray(val)) {
      for (const item of val) {
        if (item && typeof item === 'object' && '$type' in item && !visited.has(item as AstNode)) {
          const found = findDefinition(item as AstNode, name, visited);
          if (found) return found;
        }
      }
    } else if (val && typeof val === 'object' && '$type' in val && !visited.has(val as AstNode)) {
      const found = findDefinition(val as AstNode, name, visited);
      if (found) return found;
    }
  }

  return undefined;
}

/* ------------------------------------------------------------------ */
/*  Register all providers with Monaco                                */
/* ------------------------------------------------------------------ */

/**
 * Register all SysML language service providers with a Monaco instance.
 */
export function registerSysMLProviders(monacoInstance: typeof Monaco): void {
  // Hover provider
  monacoInstance.languages.registerHoverProvider(SYSML_LANGUAGE_ID, {
    provideHover(model, position) {
      const source = model.getValue();
      const info = getHoverInfo(source, position.lineNumber, position.column);
      if (!info) return null;
      return {
        contents: [{ value: info.contents }],
      };
    },
  });

  // Completion provider
  monacoInstance.languages.registerCompletionItemProvider(SYSML_LANGUAGE_ID, {
    triggerCharacters: ['.', ':'],
    provideCompletionItems(model, position) {
      const source = model.getValue();
      const items = getCompletions(source, position.lineNumber, position.column);
      const word = model.getWordUntilPosition(position);
      const range = {
        startLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endLineNumber: position.lineNumber,
        endColumn: word.endColumn,
      };

      return {
        suggestions: items.map((item) => ({
          label: item.label,
          kind: item.kind === 'keyword'
            ? monacoInstance.languages.CompletionItemKind.Keyword
            : item.kind === 'snippet'
              ? monacoInstance.languages.CompletionItemKind.Snippet
              : monacoInstance.languages.CompletionItemKind.Variable,
          insertText: item.insertText,
          insertTextRules: item.kind === 'snippet'
            ? monacoInstance.languages.CompletionItemInsertTextRule.InsertAsSnippet
            : undefined,
          detail: item.detail,
          range,
        })),
      };
    },
  });

  // Definition provider
  monacoInstance.languages.registerDefinitionProvider(SYSML_LANGUAGE_ID, {
    provideDefinition(model, position) {
      const source = model.getValue();
      const def = getDefinition(source, position.lineNumber, position.column);
      if (!def) return null;
      return {
        uri: model.uri,
        range: def,
      };
    },
  });

  // Document symbol provider
  monacoInstance.languages.registerDocumentSymbolProvider(SYSML_LANGUAGE_ID, {
    provideDocumentSymbols(model) {
      const source = model.getValue();
      const symbols = getDocumentSymbols(source);

      function toMonacoSymbols(
        syms: SymbolInfo[],
      ): Monaco.languages.DocumentSymbol[] {
        return syms.map((s) => ({
          name: s.name,
          detail: s.kind,
          kind: monacoInstance.languages.SymbolKind.Class,
          range: s.range,
          selectionRange: s.range,
          tags: [],
          children: toMonacoSymbols(s.children),
        }));
      }

      return toMonacoSymbols(symbols);
    },
  });
}

/* ------------------------------------------------------------------ */
/*  Diagnostics updater                                               */
/* ------------------------------------------------------------------ */

let _diagnosticsTimer: ReturnType<typeof setTimeout> | undefined;

/**
 * Schedule diagnostics update for a Monaco model (debounced).
 */
export function scheduleDiagnostics(
  monacoInstance: typeof Monaco,
  model: Monaco.editor.ITextModel,
  delay = 300,
): void {
  if (_diagnosticsTimer) clearTimeout(_diagnosticsTimer);

  _diagnosticsTimer = setTimeout(() => {
    const source = model.getValue();
    const diags = getDiagnostics(source);

    const markers: Monaco.editor.IMarkerData[] = diags.map((d) => ({
      message: d.message,
      severity:
        d.severity === 'error'
          ? monacoInstance.MarkerSeverity.Error
          : d.severity === 'warning'
            ? monacoInstance.MarkerSeverity.Warning
            : monacoInstance.MarkerSeverity.Info,
      startLineNumber: d.startLineNumber,
      startColumn: d.startColumn,
      endLineNumber: d.endLineNumber,
      endColumn: d.endColumn,
    }));

    monacoInstance.editor.setModelMarkers(model, 'sysml', markers);
  }, delay);
}
