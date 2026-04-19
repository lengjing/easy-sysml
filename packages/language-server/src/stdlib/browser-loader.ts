/**
 * Browser-compatible Standard Library Loader
 *
 * Loads pre-bundled SysML/KerML stdlib files into the Langium workspace.
 * Unlike the Node.js loader in `./loader.ts`, this works entirely
 * in the browser by accepting file contents as strings.
 */

import { URI, type LangiumDocument, type LangiumSharedCoreServices } from 'langium';
import { STDLIB_DEPENDENCY_LAYERS } from './config.js';

export interface StdlibBrowserResult {
  success: boolean;
  filesLoaded: number;
  errors: string[];
  loadTimeMs: number;
}

/**
 * Load the SysML standard library into a Langium workspace from
 * pre-bundled string content.
 *
 * @param shared  Langium shared services
 * @param files   Record mapping filename → file content (e.g. from the browser bundle)
 */
export async function loadStdlibBrowser(
  shared: LangiumSharedCoreServices,
  files: Record<string, string>,
): Promise<StdlibBrowserResult> {
  const start = Date.now();
  const errors: string[] = [];
  let loaded = 0;

  const { LangiumDocuments: langiumDocuments, DocumentBuilder: documentBuilder, LangiumDocumentFactory: documentFactory } = shared.workspace;

  const allDocuments: LangiumDocument[] = [];

  // Load documents in dependency order
  for (const layer of STDLIB_DEPENDENCY_LAYERS) {
    for (const filename of layer) {
      const content = files[filename];
      if (!content) {
        errors.push(`${filename}: not found in bundle`);
        continue;
      }

      try {
        const uri = URI.parse(`inmemory:///stdlib/${filename}`);

        if (langiumDocuments.hasDocument(uri)) {
          loaded++;
          continue;
        }

        const document = documentFactory.fromString(content, uri);
        (document as any).isStandard = true;
        langiumDocuments.addDocument(document);
        allDocuments.push(document);
        loaded++;
      } catch (err) {
        errors.push(`${filename}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  // Build all documents in a single batch
  if (allDocuments.length > 0) {
    try {
      await documentBuilder.build(allDocuments, { validation: false });
    } catch {
      // Build errors from incomplete dependencies are expected and non-fatal
    }
  }

  // Clear diagnostics for stdlib documents (linking warnings are expected)
  for (const doc of allDocuments) {
    if (doc.diagnostics && doc.diagnostics.length > 0) {
      doc.diagnostics = [];
    }
  }

  return {
    success: errors.length === 0 && loaded > 0,
    filesLoaded: loaded,
    errors,
    loadTimeMs: Date.now() - start,
  };
}

/**
 * Check if a Langium document is a standard library document (browser-compatible).
 */
export function isStandardLibraryDocument(doc: LangiumDocument): boolean {
  return (doc as any).isStandard === true;
}
