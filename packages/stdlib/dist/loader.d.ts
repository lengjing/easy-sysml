/** Result of loading the standard library */
export interface StdlibLoadResult {
    success: boolean;
    filesLoaded: number;
    filesExpected: number;
    errors: string[];
    warnings: string[];
    loadTimeMs: number;
    files: StdlibFile[];
}
/** A loaded stdlib file */
export interface StdlibFile {
    name: string;
    path: string;
    content: string;
    language: 'sysml' | 'kerml';
    layer: number;
}
/** Load options */
export interface StdlibLoadOptions {
    stdlibPath?: string;
    verbose?: boolean;
    layers?: number;
}
/** Load the SysML v2 standard library files */
export declare function loadStdlib(options?: StdlibLoadOptions): Promise<StdlibLoadResult>;
/** Get a list of all expected stdlib file names */
export declare function getStdlibFileList(): string[];
//# sourceMappingURL=loader.d.ts.map