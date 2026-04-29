/**
 * Stdlib Browser Entry Point
 *
 * Exports browser-compatible stdlib loading utilities and the
 * pre-bundled stdlib file contents. No Node.js dependencies.
 */

export { loadStdlibBrowser } from './browser-loader.js';
export {
	getStdlibDocumentUri,
	isStandardLibraryDocument,
	isStandardLibraryUri,
	markStandardLibraryDocument,
	STDLIB_URI_SCHEME,
} from './document-identity.js';
export type { StdlibBrowserResult } from './browser-loader.js';
export type { StdlibDocument } from './document-identity.js';
// stdlib-browser-bundle.js is generated directly into dist/ by scripts/bundle-browser.cjs
export { STDLIB_FILES } from '../stdlib-browser-bundle.js';
export { STDLIB_DEPENDENCY_LAYERS, STDLIB_FILE_COUNT, getStdlibFiles, isStdlibFile } from './config.js';
