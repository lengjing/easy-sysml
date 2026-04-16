import { SysMLParser } from './parser.js';
import type { ParseResult } from './parser.js';

/** Parse SysML v2 source code */
export function parseSysML(source: string, uri?: string): ParseResult {
  const parser = new SysMLParser();
  return parser.parse(source, uri);
}

/** Parse KerML source code (same parser, different entry point in future) */
export function parseKerML(source: string, uri?: string): ParseResult {
  // For now, KerML uses the same parser since most syntax is shared
  const parser = new SysMLParser();
  return parser.parse(source, uri);
}
