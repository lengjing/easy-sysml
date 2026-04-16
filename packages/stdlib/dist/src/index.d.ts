/**
 * @easy-sysml/stdlib
 *
 * Standard library package for the SysML v2 modeling platform.
 *
 * Provides:
 * - Built-in SysML / KerML definitions (Base, ScalarValues, Collections, …)
 * - A loader that registers all stdlib models into a Langium workspace
 * - Configuration helpers (dependency layers, file lists)
 */
export { loadStdLib } from './loader.js';
export type { StdlibLoadResult, StdlibLoadOptions } from './loader.js';
export { STDLIB_DEPENDENCY_LAYERS, STDLIB_FILE_COUNT, getStdlibFiles, isStdlibFile, } from './config.js';
//# sourceMappingURL=index.d.ts.map