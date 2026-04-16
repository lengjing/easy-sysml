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
import type { LangiumSharedCoreServices } from 'langium';
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
export declare function loadStdLib(services: LangiumSharedCoreServices, options?: StdlibLoadOptions): Promise<StdlibLoadResult>;
//# sourceMappingURL=loader.d.ts.map