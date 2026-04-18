/**
 * SysML Language Client
 *
 * Manages a Web Worker running the SysML language server and provides
 * a typed API for sending LSP requests and receiving notifications.
 *
 * Key differences from mbse-workbench client:
 * - Better initialization ordering
 * - Debug logging for all LSP messages
 * - No space (' ') in completion triggers
 */
import {
  BrowserMessageReader,
  BrowserMessageWriter,
} from 'vscode-languageserver-protocol/browser.js';
import {
  createProtocolConnection,
  InitializeRequest,
  InitializedNotification,
  DidOpenTextDocumentNotification,
  DidChangeTextDocumentNotification,
  DidCloseTextDocumentNotification,
  HoverRequest,
  CompletionRequest,
  DefinitionRequest,
  DocumentSymbolRequest,
  PublishDiagnosticsNotification,
  type ProtocolConnection,
  type InitializeParams,
  type InitializeResult,
  type Hover,
  type CompletionItem,
  type CompletionList,
  type Location,
  type LocationLink,
  type SymbolInformation,
  type DocumentSymbol,
  type PublishDiagnosticsParams,
} from 'vscode-languageserver-protocol';
import { log } from './log';
import { SYSML_LANGUAGE_ID } from './sysml-language';

export type DiagnosticsCallback = (params: PublishDiagnosticsParams) => void;

export class LanguageClient {
  private worker: Worker;
  private connection: ProtocolConnection;
  private initialized = false;
  private initPromise: Promise<InitializeResult> | undefined;
  private versionMap = new Map<string, number>();
  private diagnosticsCallback?: DiagnosticsCallback;

  constructor() {
    log.info('Creating language server worker...');

    this.worker = new Worker(
      new URL('./sysml-server-worker.ts', import.meta.url),
      { type: 'module' },
    );

    this.worker.onerror = (e) => {
      log.error('Worker error:', e.message);
    };

    const reader = new BrowserMessageReader(this.worker);
    const writer = new BrowserMessageWriter(this.worker);
    this.connection = createProtocolConnection(reader, writer);

    // Listen for diagnostics pushed by the server
    this.connection.onNotification(
      PublishDiagnosticsNotification.type,
      (params) => {
        // Skip logging diagnostics for stdlib documents — linking errors
        // in stdlib files are expected and non-actionable for the user.
        if (params.uri.includes('/stdlib/')) {
          return;
        }
        log.info(
          `Diagnostics received: ${params.diagnostics.length} issue(s) for ${params.uri}`,
        );
        for (const d of params.diagnostics) {
          log.debug(
            `  [${d.severity === 1 ? 'ERR' : d.severity === 2 ? 'WARN' : 'INFO'}] ` +
            `L${d.range.start.line + 1}:${d.range.start.character + 1} ${d.message}`,
          );
        }
        this.diagnosticsCallback?.(params);
      },
    );

    this.connection.listen();
    log.info('LSP connection listening');
  }

  onDiagnostics(callback: DiagnosticsCallback): void {
    this.diagnosticsCallback = callback;
  }

  async initialize(): Promise<InitializeResult> {
    if (this.initialized && this.initPromise) return this.initPromise;
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      log.info('Sending initialize request...');

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

      const result = await this.connection.sendRequest(
        InitializeRequest.type,
        initParams,
      );
      log.info('Initialize result received:', JSON.stringify(result.capabilities.textDocumentSync));

      this.connection.sendNotification(InitializedNotification.type, {});
      this.initialized = true;
      log.info('Language server initialized');

      return result;
    })();

    return this.initPromise;
  }

  async didOpen(uri: string, text: string): Promise<void> {
    await this.initialize();
    this.versionMap.set(uri, 1);
    log.info(`didOpen: ${uri} (${text.length} chars)`);
    this.connection.sendNotification(DidOpenTextDocumentNotification.type, {
      textDocument: {
        uri,
        languageId: SYSML_LANGUAGE_ID,
        version: 1,
        text,
      },
    });
  }

  async didChange(uri: string, text: string): Promise<void> {
    await this.initialize();
    const version = (this.versionMap.get(uri) ?? 0) + 1;
    this.versionMap.set(uri, version);
    this.connection.sendNotification(DidChangeTextDocumentNotification.type, {
      textDocument: { uri, version },
      contentChanges: [{ text }],
    });
  }

  async didClose(uri: string): Promise<void> {
    await this.initialize();
    this.versionMap.delete(uri);
    this.connection.sendNotification(DidCloseTextDocumentNotification.type, {
      textDocument: { uri },
    });
  }

  async hover(uri: string, line: number, character: number): Promise<Hover | null> {
    await this.initialize();
    return this.connection.sendRequest(HoverRequest.type, {
      textDocument: { uri },
      position: { line, character },
    });
  }

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

  async documentSymbols(
    uri: string,
  ): Promise<SymbolInformation[] | DocumentSymbol[] | null> {
    await this.initialize();
    return this.connection.sendRequest(DocumentSymbolRequest.type, {
      textDocument: { uri },
    });
  }

  dispose(): void {
    this.connection.dispose();
    this.worker.terminate();
    log.info('Language client disposed');
  }
}
