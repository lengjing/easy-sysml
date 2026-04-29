/**
 * @easy-sysml/language-server
 *
 * SysML v2 Language Server Protocol implementation with standard library.
 */

export { createSysMLServices, startServer } from './main.js';
export type { SysMLServices, KerMLServices } from './sysml-module.js';

// Re-export stdlib utilities for convenience
export {
  loadStdlib,
  findStdlibPath,
  getStdlibDocumentUri,
  isStandardLibraryDocument,
  isStandardLibraryUri,
  markStandardLibraryDocument,
  STDLIB_URI_SCHEME,
  STDLIB_DEPENDENCY_LAYERS,
  STDLIB_FILE_COUNT,
  getStdlibFiles,
  isStdlibFile,
} from './stdlib/index.js';
export type { StdlibLoadResult, StdlibLoadOptions, StdlibDocument } from './stdlib/index.js';
