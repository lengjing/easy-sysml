/**
 * SysML Document Symbol Provider
 *
 * Safe wrapper around Langium's DefaultDocumentSymbolProvider
 * that prevents LSP request failures from crashing the server.
 */

import type { DocumentSymbol, DocumentSymbolParams, CancellationToken } from 'vscode-languageserver';
import type { MaybePromise, LangiumDocument } from 'langium';
import { DefaultDocumentSymbolProvider, type LangiumServices } from 'langium/lsp';

export class SysMLDocumentSymbolProvider extends DefaultDocumentSymbolProvider {
  constructor(services: LangiumServices) {
    super(services);
  }

  override getSymbols(
    document: LangiumDocument,
    params: DocumentSymbolParams,
    cancelToken?: CancellationToken,
  ): MaybePromise<DocumentSymbol[]> {
    try {
      if (!document.parseResult?.value) {
        return [];
      }
      return super.getSymbols(document, params, cancelToken);
    } catch (err) {
      console.error('[SysML] DocumentSymbol error:', err);
      return [];
    }
  }
}
