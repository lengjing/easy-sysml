/**
 * @easy-sysml/stdlib — Browser Entry Point
 *
 * Exports browser-compatible stdlib loading utilities and the
 * pre-bundled stdlib file contents. No Node.js dependencies.
 */

export { loadStdlibBrowser } from './browser-loader.js';
export type { StdlibBrowserResult } from './browser-loader.js';
export { STDLIB_FILES } from './generated/browser-bundle.js';
export { STDLIB_DEPENDENCY_LAYERS, STDLIB_FILE_COUNT, getStdlibFiles, isStdlibFile } from './config.js';
