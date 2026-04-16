/**
 * Standard Library Configuration
 *
 * Single source of truth for stdlib file ordering and configuration.
 * Files are organized in dependency layers — each layer can be loaded
 * in parallel, but layers must be loaded sequentially.
 *
 * Total: 94 files (36 KerML + 58 SysML)
 */
/**
 * Complete SysML v2 Standard Library organized in dependency layers.
 *
 * - KerML foundation (layers 0–10): 36 files
 * - SysML core (layers 11–21): 21 files
 * - Domain libraries (layers 22–35): 37 files
 */
export declare const STDLIB_DEPENDENCY_LAYERS: readonly string[][];
/** Total number of stdlib files. */
export declare const STDLIB_FILE_COUNT: number;
/** Get all stdlib filenames as a flat array. */
export declare function getStdlibFiles(): string[];
/** Check whether a filename (or path) refers to a stdlib file. */
export declare function isStdlibFile(filename: string): boolean;
//# sourceMappingURL=config.d.ts.map