/**
 * Standard Library — Node.js Entry Point
 *
 * SysML v2 / KerML standard library files and loader.
 */

export { loadStdlib, findStdlibPath, isStandardLibraryDocument } from './loader.js';
export type { StdlibLoadResult, StdlibLoadOptions, StdlibDocument } from './loader.js';

export {
  STDLIB_DEPENDENCY_LAYERS,
  STDLIB_FILE_COUNT,
  getStdlibFiles,
  isStdlibFile,
} from './config.js';
