/**
 * SysML Playground — Main Entry Point
 *
 * Sets up Monaco Editor with the SysML language server running
 * in a Web Worker. All LSP features (diagnostics, hover, completion,
 * go-to-definition, document symbols) are wired through proper
 * Monaco providers.
 *
 * This playground is designed for debugging the language server
 * integration. A debug log panel at the bottom shows LSP messages.
 */
import * as monaco from 'monaco-editor';
import {
  CompletionItemKind,
  DiagnosticSeverity,
  SymbolKind,
  type CompletionItem,
  type CompletionList,
  type DocumentSymbol,
  type SymbolInformation,
  type Location,
  type LocationLink,
  type MarkupContent,
} from 'vscode-languageserver-protocol';
import { registerSysMLLanguage, SYSML_LANGUAGE_ID } from './sysml-language';
import { LanguageClient } from './language-client';
import { log } from './log';
import { STDLIB_FILES } from '@easy-sysml/stdlib/browser';

// -- Configure Monaco workers ------------------------------------------------
// Monaco needs web workers for editor features. We use the bundled workers.
self.MonacoEnvironment = {
  getWorker(_workerId: string, label: string) {
    switch (label) {
      case 'editorWorkerService':
        return new Worker(
          new URL('monaco-editor/esm/vs/editor/editor.worker.js', import.meta.url),
          { type: 'module' },
        );
      default:
        return new Worker(
          new URL('monaco-editor/esm/vs/editor/editor.worker.js', import.meta.url),
          { type: 'module' },
        );
    }
  },
};

// -- Constants ---------------------------------------------------------------
const DOC_URI = 'inmemory:///model.sysml';
const STDLIB_PREFIX = 'inmemory:///stdlib/';

/**
 * Ensure a read-only Monaco model exists for a stdlib file.
 * Returns the Monaco URI if the model was created or already exists.
 */
function ensureStdlibModel(uri: string): monaco.Uri | null {
  const normalized = normalizeUri(uri);
  if (!normalized.startsWith(normalizeUri(STDLIB_PREFIX))) return null;

  const filename = normalized.slice(normalizeUri(STDLIB_PREFIX).length);
  const content = STDLIB_FILES[filename];
  if (!content) {
    log.debug(`Stdlib file not found in bundle: ${filename}`);
    return null;
  }

  const monacoUri = monaco.Uri.parse(normalized);
  let model = monaco.editor.getModel(monacoUri);
  if (!model) {
    model = monaco.editor.createModel(content, SYSML_LANGUAGE_ID, monacoUri);
    log.debug(`Created stdlib model: ${filename}`);
  }
  return monacoUri;
}

/** Normalize URI slashes (server may strip extra slashes). */
const normalizeUri = (u: string) => u.replace(/^(\w+:)\/*/, '$1///');

const DEFAULT_CODE = `package Vehicle {
    part def Wheel {
        attribute diameter : Real;
    }

    part def Car {
        part wheels : Wheel[4];
        part engine : Engine;
    }

    part def Engine {
        attribute horsepower : Real;
    }
}
`;

// -- Bootstrap ---------------------------------------------------------------
async function main(): Promise<void> {
  const statusEl = document.getElementById('status')!;

  try {
    // 1. Register the SysML language (monarch tokenizer + config)
    registerSysMLLanguage();
    log.info('SysML language registered');

    // 2. Create the language client (starts the worker)
    const client = new LanguageClient();

    // 3. Create the Monaco editor with an explicit model URI
    const container = document.getElementById('editor-container')!;
    const mainModelUri = monaco.Uri.parse(DOC_URI);
    const mainModel = monaco.editor.createModel(DEFAULT_CODE, SYSML_LANGUAGE_ID, mainModelUri);
    const editor = monaco.editor.create(container, {
      model: mainModel,
      theme: 'vs-dark',
      minimap: { enabled: true },
      fontSize: 14,
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
    });
    log.info('Monaco editor created');

    // UI elements for file navigation
    const fileIndicator = document.getElementById('file-indicator')!;
    const backBtn = document.getElementById('back-btn')!;

    /** Switch editor to a different model, updating UI indicators. */
    function showModel(targetModel: monaco.editor.ITextModel, selection?: monaco.IRange) {
      editor.setModel(targetModel);
      if (selection) {
        editor.revealRangeInCenter(selection);
        editor.setSelection(selection);
      }
      const isMain = targetModel.uri.toString() === mainModelUri.toString();
      backBtn.style.display = isMain ? 'none' : 'inline-block';
      fileIndicator.textContent = isMain ? '' : `— ${targetModel.uri.path.split('/').pop() ?? targetModel.uri.path}`;
      if (!isMain) {
        editor.updateOptions({ readOnly: true });
      } else {
        editor.updateOptions({ readOnly: false });
      }
    }

    // "Back" button returns to user document
    backBtn.onclick = () => {
      const model = monaco.editor.getModel(mainModelUri);
      if (model) {
        showModel(model);
        log.info('Returned to main document');
      }
    };

    // Register opener to handle go-to-definition across files (e.g. stdlib).
    // When Monaco opens a definition in another model, we swap the editor model
    // and update the UI to show a "Back" button.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const editorService = (editor as any)._codeEditorService;
    if (editorService) {
      const origOpenCodeEditor = editorService.openCodeEditor?.bind(editorService);
      editorService.openCodeEditor = async (
        input: { resource: monaco.Uri; options?: { selection?: monaco.IRange } },
        source: monaco.editor.ICodeEditor,
      ) => {
        const targetUri = input.resource;
        const targetModel = monaco.editor.getModel(targetUri);
        if (targetModel && targetModel !== source.getModel()) {
          showModel(targetModel, input.options?.selection);
          log.info(`Opened: ${targetUri.path.split('/').pop() ?? targetUri.path}`);
          return source;
        }
        return origOpenCodeEditor?.(input, source);
      };
    }

    // 4. Register LSP-backed providers

    // -- Diagnostics (published by server) --
    // The server may normalise the URI (e.g. strip extra slashes), so
    // compare by normalising both sides.

    client.onDiagnostics((params) => {
      const model = editor.getModel();
      if (!model || normalizeUri(params.uri) !== normalizeUri(DOC_URI)) return;

      const markers: monaco.editor.IMarkerData[] = params.diagnostics.map(
        (d) => ({
          message: d.message,
          severity:
            d.severity === DiagnosticSeverity.Error
              ? monaco.MarkerSeverity.Error
              : d.severity === DiagnosticSeverity.Warning
                ? monaco.MarkerSeverity.Warning
                : d.severity === DiagnosticSeverity.Information
                  ? monaco.MarkerSeverity.Info
                  : monaco.MarkerSeverity.Hint,
          startLineNumber: d.range.start.line + 1,
          startColumn: d.range.start.character + 1,
          endLineNumber: d.range.end.line + 1,
          endColumn: d.range.end.character + 1,
          source: 'sysml',
        }),
      );

      monaco.editor.setModelMarkers(model, 'sysml-lsp', markers);
      log.info(`Set ${markers.length} marker(s) on editor model`);
    });

    // -- Hover --
    monaco.languages.registerHoverProvider(SYSML_LANGUAGE_ID, {
      async provideHover(_model, position) {
        try {
          const hover = await client.hover(
            DOC_URI,
            position.lineNumber - 1,
            position.column - 1,
          );
          if (!hover) return null;

          const contents: monaco.IMarkdownString[] = [];
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
        } catch (err) {
          log.error('Hover error:', err);
          return null;
        }
      },
    });

    // -- Completion (NO space trigger — only '.', ':') --
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
          const range: monaco.IRange = {
            startLineNumber: position.lineNumber,
            startColumn: word.startColumn,
            endLineNumber: position.lineNumber,
            endColumn: word.endColumn,
          };

          return {
            suggestions: items.map((item) => {
              const labelText =
                typeof item.label === 'string'
                  ? item.label
                  : (item.label as { label: string }).label;

              return {
                label: item.label,
                kind: toMonacoCompletionKind(item.kind),
                insertText: item.insertText ?? labelText,
                insertTextRules:
                  item.insertTextFormat === 2
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
        } catch (err) {
          log.error('Completion error:', err);
          return { suggestions: [] };
        }
      },
    });

    // -- Definition --
    monaco.languages.registerDefinitionProvider(SYSML_LANGUAGE_ID, {
      async provideDefinition(_model, position) {
        try {
          const result = await client.definition(
            DOC_URI,
            position.lineNumber - 1,
            position.column - 1,
          );
          if (!result) return null;

          const locations = Array.isArray(result) ? result : [result];
          return locations.map((loc) => {
            let locUri: string;
            let range: { start: { line: number; character: number }; end: { line: number; character: number } };

            if ('targetUri' in loc) {
              const ll = loc as LocationLink;
              locUri = ll.targetUri;
              range = ll.targetRange;
            } else {
              const l = loc as Location;
              locUri = l.uri;
              range = l.range;
            }

            // Ensure a model exists for stdlib files so Monaco can navigate
            const stdlibModelUri = ensureStdlibModel(locUri);

            return {
              uri: stdlibModelUri ?? monaco.Uri.parse(normalizeUri(locUri)),
              range: {
                startLineNumber: range.start.line + 1,
                startColumn: range.start.character + 1,
                endLineNumber: range.end.line + 1,
                endColumn: range.end.character + 1,
              },
            };
          });
        } catch (err) {
          log.error('Definition error:', err);
          return null;
        }
      },
    });

    // -- Document Symbols --
    monaco.languages.registerDocumentSymbolProvider(SYSML_LANGUAGE_ID, {
      async provideDocumentSymbols() {
        try {
          const result = await client.documentSymbols(DOC_URI);
          if (!result) return [];

          function mapSymbol(
            sym: DocumentSymbol | SymbolInformation,
          ): monaco.languages.DocumentSymbol {
            if ('range' in sym && 'selectionRange' in sym) {
              const ds = sym as DocumentSymbol;
              return {
                name: ds.name,
                detail: ds.detail ?? '',
                kind: toMonacoSymbolKind(ds.kind),
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
            const si = sym as SymbolInformation;
            const r = si.location.range;
            return {
              name: si.name,
              detail: '',
              kind: toMonacoSymbolKind(si.kind),
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
        } catch (err) {
          log.error('Document symbols error:', err);
          return [];
        }
      },
    });

    // 5. Initialize the language server and open the document
    await client.didOpen(DOC_URI, DEFAULT_CODE);
    log.info('Document opened, waiting for diagnostics...');

    // 6. Forward content changes to the language server (debounced)
    let changeTimer: ReturnType<typeof setTimeout> | undefined;
    editor.onDidChangeModelContent(() => {
      if (changeTimer !== undefined) {
        clearTimeout(changeTimer);
      }
      changeTimer = setTimeout(() => {
        const text = editor.getValue();
        client.didChange(DOC_URI, text);
      }, 300);
    });

    // 7. Mark as connected
    statusEl.textContent = '● Connected';
    statusEl.className = 'connected';
    log.info('Playground ready — all LSP features active');

    // Cleanup on page unload
    window.addEventListener('beforeunload', () => {
      if (changeTimer !== undefined) {
        clearTimeout(changeTimer);
      }
      client.didClose(DOC_URI);
      client.dispose();
    });
  } catch (err) {
    log.error('Failed to start playground:', err);
    statusEl.textContent = '● Error';
    statusEl.className = 'error';
  }
}

// -- Mapping helpers ---------------------------------------------------------

function toMonacoCompletionKind(
  kind?: CompletionItemKind,
): monaco.languages.CompletionItemKind {
  switch (kind) {
    case CompletionItemKind.Keyword:
      return monaco.languages.CompletionItemKind.Keyword;
    case CompletionItemKind.Snippet:
      return monaco.languages.CompletionItemKind.Snippet;
    case CompletionItemKind.Class:
      return monaco.languages.CompletionItemKind.Class;
    case CompletionItemKind.Function:
      return monaco.languages.CompletionItemKind.Function;
    case CompletionItemKind.Variable:
      return monaco.languages.CompletionItemKind.Variable;
    case CompletionItemKind.Field:
      return monaco.languages.CompletionItemKind.Field;
    case CompletionItemKind.Module:
      return monaco.languages.CompletionItemKind.Module;
    case CompletionItemKind.Property:
      return monaco.languages.CompletionItemKind.Property;
    case CompletionItemKind.Interface:
      return monaco.languages.CompletionItemKind.Interface;
    case CompletionItemKind.Enum:
      return monaco.languages.CompletionItemKind.Enum;
    case CompletionItemKind.EnumMember:
      return monaco.languages.CompletionItemKind.EnumMember;
    case CompletionItemKind.Struct:
      return monaco.languages.CompletionItemKind.Struct;
    case CompletionItemKind.Text:
      return monaco.languages.CompletionItemKind.Text;
    default:
      return monaco.languages.CompletionItemKind.Text;
  }
}

function toMonacoSymbolKind(
  kind?: SymbolKind,
): monaco.languages.SymbolKind {
  switch (kind) {
    case SymbolKind.Package:
      return monaco.languages.SymbolKind.Package;
    case SymbolKind.Class:
      return monaco.languages.SymbolKind.Class;
    case SymbolKind.Method:
      return monaco.languages.SymbolKind.Method;
    case SymbolKind.Property:
      return monaco.languages.SymbolKind.Property;
    case SymbolKind.Field:
      return monaco.languages.SymbolKind.Field;
    case SymbolKind.Function:
      return monaco.languages.SymbolKind.Function;
    case SymbolKind.Variable:
      return monaco.languages.SymbolKind.Variable;
    case SymbolKind.Module:
      return monaco.languages.SymbolKind.Module;
    case SymbolKind.Namespace:
      return monaco.languages.SymbolKind.Namespace;
    case SymbolKind.Enum:
      return monaco.languages.SymbolKind.Enum;
    case SymbolKind.Interface:
      return monaco.languages.SymbolKind.Interface;
    case SymbolKind.Struct:
      return monaco.languages.SymbolKind.Struct;
    default:
      return monaco.languages.SymbolKind.Class;
  }
}

main();
