/**
 * SysML Browser Workspace Manager
 *
 * Injects the bundled standard library during Langium workspace initialization
 * so browser clients follow the same startup path as the Node.js language server.
 */

import { DefaultWorkspaceManager, type LangiumDocument } from 'langium';
import type { LangiumSharedServices } from 'langium/lsp';
import type { Connection, WorkspaceFolder } from 'vscode-languageserver';
import { STDLIB_FILES, loadStdlibBrowser } from '../stdlib/browser.js';

export class SysMLBrowserWorkspaceManager extends DefaultWorkspaceManager {
  private connection?: Connection;
  private readonly shared: LangiumSharedServices;

  constructor(services: LangiumSharedServices) {
    super(services);
    this.shared = services;
    this.connection = services.lsp?.Connection;
  }

  private log(message: string): void {
    if (this.connection) {
      this.connection.console.log(message);
    } else {
      console.log(message);
    }
  }

  protected override async loadAdditionalDocuments(
    folders: WorkspaceFolder[],
    collector: (document: LangiumDocument) => void,
  ): Promise<void> {
    await super.loadAdditionalDocuments(folders, collector);

    this.log('[SysML] Loading bundled standard library...');
    const result = await loadStdlibBrowser(this.shared, STDLIB_FILES, {
      build: false,
      collector,
    });

    this.log(`[SysML] Stdlib: ${result.filesLoaded} files in ${result.loadTimeMs}ms`);

    if (result.errors.length > 0) {
      this.log(`[SysML] Stdlib errors: ${result.errors.join(', ')}`);
    }
  }
}