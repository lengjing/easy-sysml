/**
 * Browser-compatible Standard Library Loader
 *
 * Loads pre-bundled SysML/KerML stdlib files into the Langium workspace.
 * Unlike the Node.js loader in `./loader.ts`, this works entirely
 * in the browser by accepting file contents as strings.
 */

import type { LangiumDocument, LangiumSharedCoreServices } from 'langium';
import { STDLIB_DEPENDENCY_LAYERS } from './config.js';
import { getStdlibDocumentUri, markStandardLibraryDocument } from './document-identity.js';

export interface StdlibBrowserResult {
  success: boolean;
  filesLoaded: number;
  errors: string[];
  loadTimeMs: number;
}

export interface StdlibBrowserLoadOptions {
  /** Whether to build documents immediately (default: true) */
  build?: boolean;
  /** Optional collector for integrating with Langium workspace startup */
  collector?: (document: LangiumDocument) => void;
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
  options: StdlibBrowserLoadOptions = {},
): Promise<StdlibBrowserResult> {
  const start = Date.now();
  const collector = options.collector;
  const shouldBuild = options.build ?? true;
  const errors: string[] = [];
  let loaded = 0;

  const {
    LangiumDocuments: langiumDocuments,
    DocumentBuilder: documentBuilder,
    LangiumDocumentFactory: documentFactory,
  } = shared.workspace;

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
        const uri = getStdlibDocumentUri(filename);

        if (langiumDocuments.hasDocument(uri)) {
          const document = langiumDocuments.getDocument(uri);
          if (document) {
            markStandardLibraryDocument(document);
            collector?.(document);
            loaded++;
            continue;
          }
        }
    const document = markStandardLibraryDocument(documentFactory.fromString(content, uri));
        langiumDocuments.addDocument(document);
        allDocuments.push(document);
        collector?.(document);
        loaded++;
      } catch (err) {
        errors.push(`${filename}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  // Build all documents in a single batch
  if (shouldBuild && allDocuments.length > 0) {
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

