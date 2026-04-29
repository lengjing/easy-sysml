/**
 * SysML Workspace Manager
 *
 * Extends the default workspace manager to preload the standard library
 * during workspace initialization.
 */

import { DefaultWorkspaceManager, type LangiumDocument, type URI } from 'langium';
import type { FileSystemNode } from 'langium';
import type { LangiumSharedServices } from 'langium/lsp';
import type { WorkspaceFolder, Connection } from 'vscode-languageserver';
import { loadStdlib } from '../stdlib/loader.js';

export class SysMLWorkspaceManager extends DefaultWorkspaceManager {
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

    this.log('[SysML] Loading standard library...');
    const result = await loadStdlib(this.shared, {
      build: false,
      collector,
      verbose: false,
    });
    this.log(`[SysML] Stdlib: ${result.filesLoaded}/${result.filesExpected} files in ${result.loadTimeMs}ms`);

    if (result.errors.length > 0) {
      this.log(`[SysML] Stdlib errors: ${result.errors.join(', ')}`);
    }
  }

  protected override async traverseFolder(
    folderPath: URI,
    uris: URI[],
  ): Promise<void> {
    const content = await this.fileSystemProvider.readDirectory(folderPath);
    await Promise.all(
      content.map(async (entry) => {
        if (this.shouldIncludeEntry(entry)) {
          if (entry.isDirectory) {
            await this.traverseFolder(entry.uri, uris);
          } else if (entry.isFile) {
            uris.push(entry.uri);
          }
        }
      }),
    );
  }

  override shouldIncludeEntry(entry: FileSystemNode): boolean {
    const uriStr = entry.uri.toString();
    const name = uriStr.substring(uriStr.lastIndexOf('/') + 1);
    if (name.startsWith('.')) return false;
    if (entry.isDirectory) {
      return !['node_modules', 'out', 'dist', 'stdlib'].includes(name);
    }
    return super.shouldIncludeEntry(entry);
  }
}