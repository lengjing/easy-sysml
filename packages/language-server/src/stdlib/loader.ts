/**
 * Standard Library Loader
 *
 * Loads the 94 SysML v2 / KerML standard library files into a Langium workspace.
 * Can be used both in LSP mode (language server) and programmatic mode.
 *
 * The loader reads .kerml/.sysml files from the `lib/` directory,
 * creates Langium documents, and builds them in dependency order.
 */

import {
  URI,
  type LangiumDocument,
  type LangiumSharedCoreServices,
} from 'langium';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { STDLIB_DEPENDENCY_LAYERS } from './config.js';

/** Marker interface for stdlib documents */
export interface StdlibDocument extends LangiumDocument {
  isStandard?: boolean;
}

/** Result of loading the standard library */
export interface StdlibLoadResult {
  success: boolean;
  filesLoaded: number;
  filesExpected: number;
  errors: string[];
  warnings: string[];
  loadTimeMs: number;
}

/** Options for loading the standard library */
export interface StdlibLoadOptions {
  /** Custom path to stdlib directory (auto-detected if not provided) */
  stdlibPath?: string;
  /** Whether to log progress (default: false) */
  verbose?: boolean;
  /** Whether to run validation on stdlib files (default: false) */
  validate?: boolean;
}

/**
 * Resolve the path to the stdlib `lib/` directory.
 *
 * Search order:
 * 1. `SYSML_STDLIB_PATH` environment variable
 * 2. Auto-detect relative to this module's location
 */
export function findStdlibPath(): string | null {
  // Priority 1: Environment variable
  const envPath = process.env['SYSML_STDLIB_PATH'];
  if (envPath) {
    const marker = path.join(envPath, 'Base.kerml');
    if (fs.existsSync(marker)) {
      return envPath;
    }
  }

  // Priority 2: Auto-detect from module location
  let moduleDir: string;
  try {
    const __filename = fileURLToPath(import.meta.url);
    moduleDir = path.dirname(__filename);
  } catch {
    moduleDir = typeof __dirname !== 'undefined' ? __dirname : process.cwd();
  }

  const candidates = [
    path.resolve(moduleDir, '..', '..', 'lib'),  // from dist/stdlib/loader.js → lib/
    path.resolve(moduleDir, '..', 'lib'),         // from dist/loader.js → lib/
    path.resolve(moduleDir, 'lib'),               // from same dir
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(path.join(candidate, 'Base.kerml'))) {
      return candidate;
    }
  }

  return null;
}

/**
 * Load the SysML v2 / KerML standard library into a Langium workspace.
 *
 * @param shared - Langium shared services (from `createSysMLServices()`)
 * @param options - Loading options
 * @returns Result of the loading operation
 *
 * @example
 * ```typescript
 * import { loadStdlib } from '@easy-sysml/language-server';
 *
 * const result = await loadStdlib(services.shared);
 * console.log(`Loaded ${result.filesLoaded} stdlib files in ${result.loadTimeMs}ms`);
 * ```
 */
export async function loadStdlib(
  shared: LangiumSharedCoreServices,
  options: StdlibLoadOptions = {},
): Promise<StdlibLoadResult> {
  const startTime = Date.now();
  const errors: string[] = [];
  const warnings: string[] = [];
  const verbose = options.verbose ?? false;
  const validate = options.validate ?? false;

  const stdlibPath = options.stdlibPath ?? findStdlibPath();

  if (!stdlibPath) {
    return {
      success: false,
      filesLoaded: 0,
      filesExpected: STDLIB_DEPENDENCY_LAYERS.flat().length,
      errors: ['Standard library directory not found'],
      warnings: [],
      loadTimeMs: Date.now() - startTime,
    };
  }

  if (verbose) {
    console.log(`[stdlib] Loading from: ${stdlibPath}`);
  }

  const langiumDocuments = shared.workspace.LangiumDocuments;
  const documentBuilder = shared.workspace.DocumentBuilder;
  const documentFactory = shared.workspace.LangiumDocumentFactory;

  const allDocuments: LangiumDocument[] = [];
  let loadedCount = 0;
  const totalExpected = STDLIB_DEPENDENCY_LAYERS.flat().length;

  for (const layer of STDLIB_DEPENDENCY_LAYERS) {
    for (const filename of layer) {
      const filePath = path.join(stdlibPath, filename);

      if (!fs.existsSync(filePath)) {
        warnings.push(`${filename}: file not found`);
        continue;
      }

      try {
        const uri = URI.file(filePath);

        // Check if already loaded
        if (langiumDocuments.hasDocument(uri)) {
          const doc = langiumDocuments.getDocument(uri) as StdlibDocument;
          doc.isStandard = true;
          allDocuments.push(doc);
          loadedCount++;
          continue;
        }

        // Load the document
        const content = fs.readFileSync(filePath, 'utf-8');
        const document = documentFactory.fromString(content, uri) as StdlibDocument;
        document.isStandard = true;

        langiumDocuments.addDocument(document);
        allDocuments.push(document);
        loadedCount++;

        if (verbose) {
          console.log(`[stdlib] ${filename}: loaded`);
        }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        errors.push(`${filename}: ${errMsg}`);
      }
    }
  }

  // Build all documents in a single batch (much faster than individual builds)
  if (allDocuments.length > 0) {
    try {
      if (verbose) {
        console.log(`[stdlib] Building ${allDocuments.length} documents...`);
      }
      await documentBuilder.build(allDocuments, { validation: validate });
    } catch (buildError) {
      // Build errors from incomplete dependencies are expected and non-fatal
      if (verbose) {
        console.warn(`[stdlib] Build warning:`, buildError);
      }
    }
  }

  // Clear diagnostics for stdlib documents (linking warnings from incomplete deps)
  for (const doc of allDocuments) {
    if ((doc as StdlibDocument).isStandard && doc.diagnostics && doc.diagnostics.length > 0) {
      doc.diagnostics = [];
    }
  }

  const loadTimeMs = Date.now() - startTime;

  if (verbose) {
    console.log(`[stdlib] Loaded ${loadedCount}/${totalExpected} files in ${loadTimeMs}ms`);
  }

  return {
    success: errors.length === 0 && loadedCount > 0,
    filesLoaded: loadedCount,
    filesExpected: totalExpected,
    errors,
    warnings,
    loadTimeMs,
  };
}

/**
 * Check if a Langium document is a standard library document.
 */
export function isStandardLibraryDocument(doc: LangiumDocument): boolean {
  return (doc as StdlibDocument).isStandard === true;
}
