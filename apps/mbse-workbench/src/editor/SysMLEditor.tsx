/**
 * SysML Monaco Editor Component
 *
 * A React wrapper around Monaco Editor configured for SysML/KerML editing.
 * Connects to a Web Worker running the SysML language server via LSP.
 * The monarch tokenizer provides syntax highlighting; hover, completion,
 * go-to-definition, and diagnostics are powered by the real LSP.
 */
import React, { useRef, useCallback, useEffect } from 'react';
import Editor, { type OnMount, type BeforeMount } from '@monaco-editor/react';
import type * as Monaco from 'monaco-editor';
import { registerSysMLLanguage, SYSML_LANGUAGE_ID } from './sysml-language';
import { SysMLLanguageClient } from './sysml-language-client';
import type {
  CompletionItem,
  CompletionList,
  DocumentSymbol,
  SymbolInformation,
  Location,
  LocationLink,
  MarkupContent,
} from 'vscode-languageserver-protocol';

export interface SysMLEditorProps {
  /** Current editor value. */
  value: string;
  /** Called whenever the content changes. */
  onChange: (value: string) => void;
  /** Optional CSS class for the container div. */
  className?: string;
}

/** Document URI used for LSP communication. */
const DOC_URI = 'inmemory:///model.sysml';

/** Normalize a URI to ensure triple-slash authority (Langium may collapse it). */
const normalizeUri = (u: string) => u.replace(/^(\w+:)\/*/, '$1///');

/** Shared LSP client singleton. */
let _client: SysMLLanguageClient | undefined;
/** Whether Monaco providers have been registered. */
let _providersRegistered = false;

function getClient(): SysMLLanguageClient {
  if (!_client) {
    _client = new SysMLLanguageClient();
  }
  return _client;
}

/* ------------------------------------------------------------------ */
/*  Register Monaco providers backed by the LSP client                */
/* ------------------------------------------------------------------ */

function registerLSPProviders(monaco: typeof Monaco): void {
  const client = getClient();

  // Hover provider
  monaco.languages.registerHoverProvider(SYSML_LANGUAGE_ID, {
    async provideHover(model, position) {
      try {
        const hover = await client.hover(
          DOC_URI,
          position.lineNumber - 1,
          position.column - 1,
        );
        if (!hover) return null;

        const contents: Monaco.IMarkdownString[] = [];
        if (typeof hover.contents === 'string') {
          contents.push({ value: hover.contents });
        } else if (Array.isArray(hover.contents)) {
          for (const c of hover.contents) {
            if (typeof c === 'string') {
              contents.push({ value: c });
            } else if ('value' in c) {
              contents.push({ value: c.value });
            }
          }
        } else if ('kind' in hover.contents) {
          contents.push({ value: (hover.contents as MarkupContent).value });
        } else if ('value' in hover.contents) {
          contents.push({ value: hover.contents.value });
        }

        return { contents };
      } catch {
        return null;
      }
    },
  });

  // Completion provider
  monaco.languages.registerCompletionItemProvider(SYSML_LANGUAGE_ID, {
    triggerCharacters: ['.', ':'],
    async provideCompletionItems(model, position) {
      try {
        const result = await client.completion(
          DOC_URI,
          position.lineNumber - 1,
          position.column - 1,
        );
        if (!result) return { suggestions: [] };

        const items: CompletionItem[] = Array.isArray(result)
          ? result
          : (result as CompletionList).items;

        const word = model.getWordUntilPosition(position);
        const range: Monaco.IRange = {
          startLineNumber: position.lineNumber,
          startColumn: word.startColumn,
          endLineNumber: position.lineNumber,
          endColumn: word.endColumn,
        };

        return {
          suggestions: items.map((item) => {
            const labelText = typeof item.label === 'string'
              ? item.label
              : (item.label as { label: string }).label;

            return {
              label: item.label,
              kind: SysMLLanguageClient.toMonacoCompletionKind(
                monaco,
                item.kind,
              ),
              insertText: item.insertText ?? labelText,
              insertTextRules: item.insertTextFormat === 2
                ? monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet
                : undefined,
              detail: item.detail,
              documentation: item.documentation
                ? typeof item.documentation === 'string'
                  ? item.documentation
                  : { value: (item.documentation as MarkupContent).value }
                : undefined,
              range,
            };
          }),
        };
      } catch {
        return { suggestions: [] };
      }
    },
  });

  // Definition provider
  monaco.languages.registerDefinitionProvider(SYSML_LANGUAGE_ID, {
    async provideDefinition(model, position) {
      try {
        const result = await client.definition(
          DOC_URI,
          position.lineNumber - 1,
          position.column - 1,
        );
        if (!result) return null;

        const locations = Array.isArray(result) ? result : [result];
        return locations.map((loc) => {
          if ('targetUri' in loc) {
            // LocationLink
            const ll = loc as LocationLink;
            return {
              uri: monaco.Uri.parse(ll.targetUri),
              range: {
                startLineNumber: ll.targetRange.start.line + 1,
                startColumn: ll.targetRange.start.character + 1,
                endLineNumber: ll.targetRange.end.line + 1,
                endColumn: ll.targetRange.end.character + 1,
              },
            };
          }
          // Location
          const l = loc as Location;
          return {
            uri: monaco.Uri.parse(l.uri),
            range: {
              startLineNumber: l.range.start.line + 1,
              startColumn: l.range.start.character + 1,
              endLineNumber: l.range.end.line + 1,
              endColumn: l.range.end.character + 1,
            },
          };
        });
      } catch {
        return null;
      }
    },
  });

  // Document symbol provider
  monaco.languages.registerDocumentSymbolProvider(SYSML_LANGUAGE_ID, {
    async provideDocumentSymbols(model) {
      try {
        const result = await client.documentSymbols(DOC_URI);
        if (!result) return [];

        function mapSymbol(
          sym: DocumentSymbol | SymbolInformation,
        ): Monaco.languages.DocumentSymbol {
          if ('range' in sym && 'selectionRange' in sym) {
            // DocumentSymbol (hierarchical)
            const ds = sym as DocumentSymbol;
            return {
              name: ds.name,
              detail: ds.detail ?? '',
              kind: SysMLLanguageClient.toMonacoSymbolKind(monaco, ds.kind),
              range: {
                startLineNumber: ds.range.start.line + 1,
                startColumn: ds.range.start.character + 1,
                endLineNumber: ds.range.end.line + 1,
                endColumn: ds.range.end.character + 1,
              },
              selectionRange: {
                startLineNumber: ds.selectionRange.start.line + 1,
                startColumn: ds.selectionRange.start.character + 1,
                endLineNumber: ds.selectionRange.end.line + 1,
                endColumn: ds.selectionRange.end.character + 1,
              },
              tags: [],
              children: ds.children?.map(mapSymbol) ?? [],
            };
          }
          // SymbolInformation (flat)
          const si = sym as SymbolInformation;
          const r = si.location.range;
          return {
            name: si.name,
            detail: '',
            kind: SysMLLanguageClient.toMonacoSymbolKind(monaco, si.kind),
            range: {
              startLineNumber: r.start.line + 1,
              startColumn: r.start.character + 1,
              endLineNumber: r.end.line + 1,
              endColumn: r.end.character + 1,
            },
            selectionRange: {
              startLineNumber: r.start.line + 1,
              startColumn: r.start.character + 1,
              endLineNumber: r.end.line + 1,
              endColumn: r.end.character + 1,
            },
            tags: [],
            children: [],
          };
        }

        return result.map(mapSymbol);
      } catch {
        return [];
      }
    },
  });
}

/* ------------------------------------------------------------------ */
/*  Editor component                                                  */
/* ------------------------------------------------------------------ */

export const SysMLEditor: React.FC<SysMLEditorProps> = ({
  value,
  onChange,
  className,
}) => {
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<typeof Monaco | null>(null);
  const docOpenRef = useRef(false);

  /** Register the SysML language before Monaco mounts. */
  const handleBeforeMount: BeforeMount = useCallback((monaco) => {
    registerSysMLLanguage(monaco);
    if (!_providersRegistered) {
      registerLSPProviders(monaco);
      _providersRegistered = true;
    }
    monacoRef.current = monaco;
  }, []);

  /** Store the editor instance, connect to LSP, open the document. */
  const handleMount: OnMount = useCallback(
    (editor, monaco) => {
      editorRef.current = editor;
      monacoRef.current = monaco;

      const client = getClient();
      client.setMonaco(monaco);

      // Register for diagnostics
      client.onDiagnostics((uri, markers) => {
        const model = editor.getModel();
        if (model && normalizeUri(uri) === normalizeUri(DOC_URI)) {
          monaco.editor.setModelMarkers(model, 'sysml-lsp', markers);
        }
      });

      // Open the document
      client.didOpen(DOC_URI, value).then(() => {
        docOpenRef.current = true;
      });

      editor.focus();
    },
    [value],
  );

  /** Propagate content changes and notify LSP (debounced). */
  const changeTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const handleChange = useCallback(
    (val: string | undefined) => {
      const text = val ?? '';
      onChange(text);

      if (changeTimerRef.current !== undefined) {
        clearTimeout(changeTimerRef.current);
      }
      changeTimerRef.current = setTimeout(() => {
        if (docOpenRef.current) {
          getClient().didChange(DOC_URI, text);
        }
      }, 300);
    },
    [onChange],
  );

  /** Observe theme changes (dark ↔ light). */
  useEffect(() => {
    const observer = new MutationObserver(() => {
      const monaco = monacoRef.current;
      if (monaco) {
        const dark = document.documentElement.classList.contains('dark');
        monaco.editor.setTheme(dark ? 'vs-dark' : 'vs');
      }
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });
    return () => observer.disconnect();
  }, []);

  /** Cleanup on unmount. */
  useEffect(() => {
    return () => {
      if (changeTimerRef.current !== undefined) {
        clearTimeout(changeTimerRef.current);
      }
      if (docOpenRef.current) {
        getClient().didClose(DOC_URI);
        docOpenRef.current = false;
      }
    };
  }, []);

  const isDark = document.documentElement.classList.contains('dark');

  return (
    <div className={className} style={{ width: '100%', height: '100%' }}>
      <Editor
        language={SYSML_LANGUAGE_ID}
        value={value}
        onChange={handleChange}
        beforeMount={handleBeforeMount}
        onMount={handleMount}
        theme={isDark ? 'vs-dark' : 'vs'}
        options={{
          minimap: { enabled: true },
          fontSize: 12,
          fontFamily:
            "'JetBrains Mono', 'Fira Code', 'Cascadia Code', Menlo, Monaco, monospace",
          lineNumbers: 'on',
          scrollBeyondLastLine: false,
          automaticLayout: true,
          tabSize: 4,
          wordWrap: 'on',
          renderWhitespace: 'selection',
          bracketPairColorization: { enabled: true },
          suggestOnTriggerCharacters: true,
          folding: true,
          glyphMargin: true,
          padding: { top: 8, bottom: 8 },
          scrollbar: {
            verticalScrollbarSize: 6,
            horizontalScrollbarSize: 6,
          },
        }}
      />
    </div>
  );
};
