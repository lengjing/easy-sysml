import { SysMLParser } from './parser.js';
/** Parse SysML v2 source code */
export function parseSysML(source, uri) {
    const parser = new SysMLParser();
    return parser.parse(source, uri);
}
/** Parse KerML source code (same parser, different entry point in future) */
export function parseKerML(source, uri) {
    // For now, KerML uses the same parser since most syntax is shared
    const parser = new SysMLParser();
    return parser.parse(source, uri);
}
//# sourceMappingURL=parse-api.js.map