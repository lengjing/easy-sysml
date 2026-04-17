/**
 * SysML Workspace Manager
 *
 * Extends the default workspace manager to preload the standard library
 * during workspace initialization.
 */

import { DefaultWorkspaceManager, type LangiumDocument, UriUtils, type URI } from 'langium';
import type { FileSystemNode } from 'langium';
import type { LangiumSharedServices } from 'langium/lsp';
import type { WorkspaceFolder, Connection } from 'vscode-languageserver';
import { loadStdlib } from '@easy-sysml/stdlib';

export class SysMLWorkspaceManager extends DefaultWorkspaceManager {
  private connection?: Connection;

  constructor(services: LangiumSharedServices) {
    super(services);
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
    const result = await loadStdlib(this.serviceRegistry as any, { verbose: false });
    this.log(`[SysML] Stdlib: ${result.filesLoaded}/${result.filesExpected} files in ${result.loadTimeMs}ms`);

    if (result.errors.length > 0) {
      this.log(`[SysML] Stdlib errors: ${result.errors.join(', ')}`);
    }
  }

  protected override async traverseFolder(
    workspaceFolder: WorkspaceFolder,
    folderPath: URI,
    fileExtensions: string[],
    collector: (document: LangiumDocument) => void,
  ): Promise<void> {
    const content = await this.fileSystemProvider.readDirectory(folderPath);
    await Promise.all(
      content.map(async (entry) => {
        if (this.includeEntry(workspaceFolder, entry, fileExtensions)) {
          if (entry.isDirectory) {
            await this.traverseFolder(workspaceFolder, entry.uri, fileExtensions, collector);
          } else if (entry.isFile) {
            const document = await this.langiumDocuments.getOrCreateDocument(entry.uri);
            collector(document);
          }
        }
      }),
    );
  }

  protected override includeEntry(
    workspaceFolder: WorkspaceFolder,
    entry: FileSystemNode,
    fileExtensions: string[],
  ): boolean {
    const name = UriUtils.basename(entry.uri);
    if (name.startsWith('.')) return false;
    if (entry.isDirectory) {
      return !['node_modules', 'out', 'dist', 'stdlib'].includes(name);
    }
    return super.includeEntry(workspaceFolder, entry, fileExtensions);
  }
}
