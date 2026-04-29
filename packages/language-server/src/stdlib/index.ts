/**
 * Standard Library — Node.js Entry Point
 *
 * SysML v2 / KerML standard library files and loader.
 */

export { loadStdlib, findStdlibPath } from './loader.js';
export {
  getStdlibDocumentUri,
  isStandardLibraryDocument,
  isStandardLibraryUri,
  markStandardLibraryDocument,
  STDLIB_URI_SCHEME,
} from './document-identity.js';
export type { StdlibLoadResult, StdlibLoadOptions } from './loader.js';
export type { StdlibDocument } from './document-identity.js';

export {
  STDLIB_DEPENDENCY_LAYERS,
  STDLIB_FILE_COUNT,
  getStdlibFiles,
  isStdlibFile,
} from './config.js';
