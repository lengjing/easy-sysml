import type { ParseResult } from './parser.js';
/** Parse SysML v2 source code */
export declare function parseSysML(source: string, uri?: string): ParseResult;
/** Parse KerML source code (same parser, different entry point in future) */
export declare function parseKerML(source: string, uri?: string): ParseResult;
//# sourceMappingURL=parse-api.d.ts.map