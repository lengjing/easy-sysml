/**
 * SysML Language Server Worker
 *
 * Web Worker entry point that starts the SysML language server.
 * Delegates to @easy-sysml/language-server/main-browser which handles
 * connection setup, stdlib loading, and server startup.
 */
import '@easy-sysml/language-server/main-browser';
