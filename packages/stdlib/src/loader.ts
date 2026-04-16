/**
 * Standard Library Loader
 *
 * Loads the official SysML v2 / KerML standard library files into a Langium
 * workspace so that built-in types (e.g. ScalarValues::Boolean, Base::Anything)
 * are globally available for semantic analysis and cross-reference resolution.
 *
 * Usage:
 *   import { loadStdLib } from '@easy-sysml/stdlib';
 *   import { createServices } from '...';  // your Langium service factory
 *
 *   const services = createServices(...);
 *   await loadStdLib(services.shared);
 */

import type {
    LangiumSharedCoreServices,
    LangiumDocument,
    DocumentBuilder,
    LangiumDocuments,
    LangiumDocumentFactory,
} from 'langium';
import { URI } from 'langium';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { STDLIB_DEPENDENCY_LAYERS, STDLIB_FILE_COUNT } from './config.js';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** Detailed result returned by {@link loadStdLib}. */
export interface StdlibLoadResult {
    /** `true` when at least one file was loaded and no hard errors occurred. */
    success: boolean;
    /** Number of files successfully registered in the workspace. */
    filesLoaded: number;
    /** Number of files the loader expected to find. */
    filesExpected: number;
    /** Hard errors that prevented individual files from loading. */
    errors: string[];
    /** Soft warnings (e.g. missing optional files). */
    warnings: string[];
    /** Wall-clock time spent loading in milliseconds. */
    loadTimeMs: number;
}

/** Options accepted by {@link loadStdLib}. */
export interface StdlibLoadOptions {
    /** Custom path to the stdlib directory (auto-detected if omitted). */
    stdlibPath?: string;
    /** Log progress to the console (default: `false`). */
    verbose?: boolean;
    /** Run Langium validation on stdlib documents (default: `false`). */
    validate?: boolean;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Locate the `lib/` directory that ships with this package.
 *
 * Resolution order:
 *   1. `SYSML_STDLIB_PATH` environment variable (explicit override).
 *   2. Auto-detection relative to the current module file.
 */
function findStdlibPath(): string | null {
    // 1. Explicit override
    const envPath = process.env['SYSML_STDLIB_PATH'];
    if (envPath) {
        const marker = path.join(envPath, 'Base.kerml');
        if (fs.existsSync(marker)) {
            return envPath;
        }
        console.warn(
            `[stdlib] SYSML_STDLIB_PATH="${envPath}" does not contain Base.kerml — falling back to auto-detection`,
        );
    }

    // 2. Auto-detection from module location
    let dirPath: string;
    if (typeof __dirname !== 'undefined') {
        // CJS context
        dirPath = __dirname;
    } else {
        // ESM context
        const thisFile = fileURLToPath(import.meta.url);
        dirPath = path.dirname(thisFile);
    }

    const candidates = [
        // Running from source:  src/loader.ts  → ../lib
        path.resolve(dirPath, '..', 'lib'),
        // Running from dist:    dist/src/loader.js → ../../lib
        path.resolve(dirPath, '..', '..', 'lib'),
        // Bundled / alternate layout
        path.resolve(dirPath, 'lib'),
    ];

    for (const candidate of candidates) {
        if (fs.existsSync(path.join(candidate, 'Base.kerml'))) {
            return candidate;
        }
    }

    return null;
}

// ---------------------------------------------------------------------------
// Main API
// ---------------------------------------------------------------------------

/**
 * Load the SysML v2 / KerML standard library into a Langium workspace.
 *
 * Call this **after** creating your Langium services and **before** parsing
 * user models so that stdlib types resolve correctly.
 *
 * @param services - The **shared** Langium services object.
 * @param options  - Optional configuration.
 * @returns A promise that resolves with detailed load statistics.
 *
 * @example
 * ```ts
 * const services = createSysMLServices(...);
 * await loadStdLib(services.shared);
 * // stdlib types (e.g. ScalarValues::Boolean) are now resolvable
 * ```
 */
export async function loadStdLib(
    services: LangiumSharedCoreServices,
    options: StdlibLoadOptions = {},
): Promise<StdlibLoadResult> {
    const startTime = Date.now();
    const errors: string[] = [];
    const warnings: string[] = [];
    const verbose = options.verbose ?? false;
    const validate = options.validate ?? false;

    // Resolve stdlib directory
    const stdlibPath = options.stdlibPath ?? findStdlibPath();

    if (!stdlibPath) {
        return {
            success: false,
            filesLoaded: 0,
            filesExpected: STDLIB_FILE_COUNT,
            errors: ['Standard library directory not found. Set SYSML_STDLIB_PATH or install @easy-sysml/stdlib correctly.'],
            warnings: [],
            loadTimeMs: Date.now() - startTime,
        };
    }

    if (verbose) {
        console.log(`[stdlib] Loading from: ${stdlibPath}`);
    }

    // Grab workspace services
    const langiumDocuments: LangiumDocuments = services.workspace.LangiumDocuments;
    const documentBuilder: DocumentBuilder = services.workspace.DocumentBuilder;
    const documentFactory: LangiumDocumentFactory = services.workspace.LangiumDocumentFactory;

    const allDocuments: LangiumDocument[] = [];
    let loadedCount = 0;

    // Load files layer by layer (respecting dependency order)
    for (const layer of STDLIB_DEPENDENCY_LAYERS) {
        for (const filename of layer) {
            const filePath = path.join(stdlibPath, filename);

            if (!fs.existsSync(filePath)) {
                warnings.push(`${filename}: file not found`);
                continue;
            }

            try {
                const uri = URI.file(filePath);

                // Skip if already registered
                if (langiumDocuments.hasDocument(uri)) {
                    allDocuments.push(langiumDocuments.getDocument(uri)!);
                    loadedCount++;
                    if (verbose) console.log(`[stdlib] ${filename}: already loaded`);
                    continue;
                }

                // Read and register
                const content = fs.readFileSync(filePath, 'utf-8');
                const document = documentFactory.fromString(content, uri);

                langiumDocuments.addDocument(document);
                allDocuments.push(document);
                loadedCount++;

                if (verbose) console.log(`[stdlib] ${filename}: loaded`);
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                errors.push(`${filename}: ${msg}`);
            }
        }
    }

    // Build all loaded documents in one batch
    if (allDocuments.length > 0) {
        try {
            if (verbose) console.log(`[stdlib] Building ${allDocuments.length} documents…`);

            await documentBuilder.build(allDocuments, { validation: validate });

            if (verbose) console.log(`[stdlib] Build complete`);
        } catch (buildError) {
            // Build warnings are common (incomplete cross-references between layers).
            if (verbose) console.warn(`[stdlib] Build warning:`, buildError);
        }
    }

    // Suppress stdlib diagnostics — they are expected to have linking warnings
    for (const doc of allDocuments) {
        if (doc.diagnostics && doc.diagnostics.length > 0) {
            doc.diagnostics = [];
        }
    }

    const loadTimeMs = Date.now() - startTime;

    if (verbose) {
        console.log(`[stdlib] Loaded ${loadedCount}/${STDLIB_FILE_COUNT} files in ${loadTimeMs}ms`);
        if (errors.length > 0) console.log(`[stdlib] Errors: ${errors.length}`);
        if (warnings.length > 0) console.log(`[stdlib] Warnings: ${warnings.length}`);
    }

    return {
        success: errors.length === 0 && loadedCount > 0,
        filesLoaded: loadedCount,
        filesExpected: STDLIB_FILE_COUNT,
        errors,
        warnings,
        loadTimeMs,
    };
}
