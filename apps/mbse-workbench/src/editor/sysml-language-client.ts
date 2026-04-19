/**
 * SysML Language Client
 *
 * Manages a Web Worker running the SysML language server and provides
 * a typed API for sending LSP requests and receiving notifications.
 * Uses vscode-languageserver-protocol for JSON-RPC message types.
 */
import type * as Monaco from 'monaco-editor';
import {
  BrowserMessageReader,
  BrowserMessageWriter,
} from 'vscode-languageserver-protocol/browser.js';
import {
  createProtocolConnection,
  InitializeRequest,
  InitializeParams,
  InitializedNotification,
  DidOpenTextDocumentNotification,
  DidChangeTextDocumentNotification,
  DidCloseTextDocumentNotification,
  HoverRequest,
  CompletionRequest,
  DefinitionRequest,
  DocumentSymbolRequest,
  PublishDiagnosticsNotification,
  CompletionItemKind,
  SymbolKind,
  DiagnosticSeverity,
  type ProtocolConnection,
  type Hover,
  type CompletionItem,
  type CompletionList,
  type Location,
  type LocationLink,
  type SymbolInformation,
  type DocumentSymbol,
  type Diagnostic,
} from 'vscode-languageserver-protocol';
import { SYSML_LANGUAGE_ID } from './sysml-language';

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

interface DiagnosticCallback {
  (uri: string, diagnostics: Monaco.editor.IMarkerData[]): void;
}

interface DocumentSymbolCallback {
  (uri: string, symbols: DocumentSymbol[]): void;
}

/* ------------------------------------------------------------------ */
/*  Client                                                            */
/* ------------------------------------------------------------------ */

export class SysMLLanguageClient {
  private worker: Worker;
  private connection: ProtocolConnection;
  private initialized = false;
  private initPromise: Promise<void> | undefined;
  private versionMap = new Map<string, number>();
  private diagnosticCallback?: DiagnosticCallback;
  private documentSymbolCallback?: DocumentSymbolCallback;
  private monacoInstance?: typeof Monaco;

  constructor() {
    this.worker = new Worker(
      new URL('./sysml-server-worker.ts', import.meta.url),
      { type: 'module' },
    );

    this.worker.onerror = (e) => {
      console.error('[SysMLLanguageClient] Worker error:', e.message);
    };

    const reader = new BrowserMessageReader(this.worker);
    const writer = new BrowserMessageWriter(this.worker);
    this.connection = createProtocolConnection(reader, writer);

    // Listen for diagnostics pushed by the server
    this.connection.onNotification(
      PublishDiagnosticsNotification.type,
      (params) => {
        // Skip diagnostics for stdlib documents — linking errors in stdlib
        // files are expected and non-actionable for the user.
        if (params.uri.includes('/stdlib/')) {
          return;
        }
        if (this.diagnosticCallback && this.monacoInstance) {
          const markers = params.diagnostics.map((d) =>
            this.toMonacoMarker(d),
          );
          this.diagnosticCallback(params.uri, markers);
        }
        // When diagnostics arrive the server has finished processing;
        // request fresh document symbols so the model view stays in sync.
        if (this.documentSymbolCallback) {
          this.requestDocumentSymbols(params.uri);
        }
      },
    );

    this.connection.listen();
  }

  /** Set the Monaco instance (needed for severity mapping). */
  setMonaco(monaco: typeof Monaco): void {
    this.monacoInstance = monaco;
  }

  /** Register a callback for diagnostics pushed by the server. */
  onDiagnostics(callback: DiagnosticCallback): void {
    this.diagnosticCallback = callback;
  }

  /** Register a callback for document symbols. */
  onDocumentSymbols(callback: DocumentSymbolCallback): void {
    this.documentSymbolCallback = callback;
  }

  /** Initialize the language server (idempotent). */
  async initialize(): Promise<void> {
    if (this.initialized) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      const initParams: InitializeParams = {
        processId: null,
        capabilities: {
          textDocument: {
            hover: { contentFormat: ['markdown', 'plaintext'] },
            completion: {
              completionItem: {
                snippetSupport: true,
                documentationFormat: ['markdown', 'plaintext'],
              },
            },
            definition: {},
            documentSymbol: { hierarchicalDocumentSymbolSupport: true },
            publishDiagnostics: {},
          },
        },
        rootUri: null,
        workspaceFolders: null,
      };

      await this.connection.sendRequest(InitializeRequest.type, initParams);
      this.connection.sendNotification(InitializedNotification.type, {});
      this.initialized = true;
    })();

    return this.initPromise;
  }

  /** Notify the server that a document was opened. */
  async didOpen(uri: string, text: string): Promise<void> {
    await this.initialize();
    this.versionMap.set(uri, 1);
    this.connection.sendNotification(
      DidOpenTextDocumentNotification.type,
      {
        textDocument: {
          uri,
          languageId: SYSML_LANGUAGE_ID,
          version: 1,
          text,
        },
      },
    );
  }

  /** Notify the server that a document content changed (full sync). */
  async didChange(uri: string, text: string): Promise<void> {
    await this.initialize();
    const version = (this.versionMap.get(uri) ?? 0) + 1;
    this.versionMap.set(uri, version);
    this.connection.sendNotification(
      DidChangeTextDocumentNotification.type,
      {
        textDocument: { uri, version },
        contentChanges: [{ text }],
      },
    );
  }

  /** Notify the server that a document was closed. */
  async didClose(uri: string): Promise<void> {
    await this.initialize();
    this.versionMap.delete(uri);
    this.connection.sendNotification(
      DidCloseTextDocumentNotification.type,
      {
        textDocument: { uri },
      },
    );
  }

  /** Request hover info at a position. */
  async hover(
    uri: string,
    line: number,
    character: number,
  ): Promise<Hover | null> {
    await this.initialize();
    return this.connection.sendRequest(HoverRequest.type, {
      textDocument: { uri },
      position: { line, character },
    });
  }

  /** Request completion at a position. */
  async completion(
    uri: string,
    line: number,
    character: number,
  ): Promise<CompletionItem[] | CompletionList | null> {
    await this.initialize();
    return this.connection.sendRequest(CompletionRequest.type, {
      textDocument: { uri },
      position: { line, character },
    });
  }

  /** Request go-to-definition. */
  async definition(
    uri: string,
    line: number,
    character: number,
  ): Promise<Location | Location[] | LocationLink[] | null> {
    await this.initialize();
    return this.connection.sendRequest(DefinitionRequest.type, {
      textDocument: { uri },
      position: { line, character },
    });
  }

  /** Request document symbols. */
  async documentSymbols(
    uri: string,
  ): Promise<SymbolInformation[] | DocumentSymbol[] | null> {
    await this.initialize();
    return this.connection.sendRequest(DocumentSymbolRequest.type, {
      textDocument: { uri },
    });
  }

  /**
   * Internal: request document symbols and push to callback.
   * Called automatically after diagnostics arrive.
   */
  private async requestDocumentSymbols(uri: string): Promise<void> {
    try {
      const result = await this.documentSymbols(uri);
      if (result && this.documentSymbolCallback) {
        // Filter to DocumentSymbol (hierarchical) — ignore flat SymbolInformation
        const symbols = result.filter(
          (s): s is DocumentSymbol => 'range' in s && 'selectionRange' in s,
        );
        this.documentSymbolCallback(uri, symbols);
      }
    } catch {
      // Silently ignore — symbols are best-effort
    }
  }

  /** Dispose the client and terminate the worker. */
  dispose(): void {
    this.connection.dispose();
    this.worker.terminate();
  }

  /* ---------------------------------------------------------------- */
  /*  Mapping helpers                                                 */
  /* ---------------------------------------------------------------- */

  private toMonacoMarker(d: Diagnostic): Monaco.editor.IMarkerData {
    const mono = this.monacoInstance;
    return {
      message: d.message,
      severity: mono
        ? d.severity === DiagnosticSeverity.Error
          ? mono.MarkerSeverity.Error
          : d.severity === DiagnosticSeverity.Warning
            ? mono.MarkerSeverity.Warning
            : mono.MarkerSeverity.Info
        : /* fallback */ 8 /* MarkerSeverity.Error */,
      startLineNumber: d.range.start.line + 1,
      startColumn: d.range.start.character + 1,
      endLineNumber: d.range.end.line + 1,
      endColumn: d.range.end.character + 1,
      source: 'sysml',
    };
  }

  /** Map LSP CompletionItemKind → Monaco CompletionItemKind */
  static toMonacoCompletionKind(
    mono: typeof Monaco,
    kind?: CompletionItemKind,
  ): Monaco.languages.CompletionItemKind {
    switch (kind) {
      case CompletionItemKind.Keyword:
        return mono.languages.CompletionItemKind.Keyword;
      case CompletionItemKind.Snippet:
        return mono.languages.CompletionItemKind.Snippet;
      case CompletionItemKind.Class:
        return mono.languages.CompletionItemKind.Class;
      case CompletionItemKind.Function:
        return mono.languages.CompletionItemKind.Function;
      case CompletionItemKind.Variable:
        return mono.languages.CompletionItemKind.Variable;
      case CompletionItemKind.Field:
        return mono.languages.CompletionItemKind.Field;
      case CompletionItemKind.Module:
        return mono.languages.CompletionItemKind.Module;
      case CompletionItemKind.Property:
        return mono.languages.CompletionItemKind.Property;
      default:
        return mono.languages.CompletionItemKind.Text;
    }
  }

  /** Map LSP SymbolKind → Monaco SymbolKind */
  static toMonacoSymbolKind(
    mono: typeof Monaco,
    kind?: SymbolKind,
  ): Monaco.languages.SymbolKind {
    switch (kind) {
      case SymbolKind.Package:
        return mono.languages.SymbolKind.Package;
      case SymbolKind.Class:
        return mono.languages.SymbolKind.Class;
      case SymbolKind.Method:
        return mono.languages.SymbolKind.Method;
      case SymbolKind.Property:
        return mono.languages.SymbolKind.Property;
      case SymbolKind.Field:
        return mono.languages.SymbolKind.Field;
      case SymbolKind.Function:
        return mono.languages.SymbolKind.Function;
      case SymbolKind.Variable:
        return mono.languages.SymbolKind.Variable;
      case SymbolKind.Module:
        return mono.languages.SymbolKind.Module;
      case SymbolKind.Namespace:
        return mono.languages.SymbolKind.Namespace;
      default:
        return mono.languages.SymbolKind.Class;
    }
  }
}
