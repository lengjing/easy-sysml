/**
 * Easy SysML — VSCode Extension Entry Point
 *
 * Activates the SysML v2 language server client for .sysml and .kerml files.
 * The language server is bundled into dist/server.js by esbuild.mjs.
 * The SysML/KerML stdlib files are copied into lib/ by esbuild.mjs.
 */

import * as path from 'path';
import * as vscode from 'vscode';
import {
  LanguageClient,
  type LanguageClientOptions,
  type ServerOptions,
  TransportKind,
} from 'vscode-languageclient/node';

let client: LanguageClient | undefined;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  // The language server is bundled into dist/server.js by esbuild.mjs
  const serverModule = context.asAbsolutePath(path.join('dist', 'server.js'));

  // The stdlib lib/ directory is copied next to the extension root by esbuild.mjs.
  // Pass its absolute path so the server can locate stdlib files regardless of
  // where Node.js resolves __dirname inside the bundle.
  const stdlibPath = context.asAbsolutePath('lib');

  const serverOptions: ServerOptions = {
    run: {
      module: serverModule,
      transport: TransportKind.ipc,
      options: { env: { ...process.env, SYSML_STDLIB_PATH: stdlibPath } },
    },
    debug: {
      module: serverModule,
      transport: TransportKind.ipc,
      options: {
        execArgv: ['--nolazy', '--inspect=6009'],
        env: { ...process.env, SYSML_STDLIB_PATH: stdlibPath },
      },
    },
  };

  const clientOptions: LanguageClientOptions = {
    documentSelector: [
      { scheme: 'file', language: 'sysml' },
      { scheme: 'file', language: 'kerml' },
    ],
  };

  client = new LanguageClient(
    'easy-sysml',
    'Easy SysML Language Server',
    serverOptions,
    clientOptions,
  );

  await client.start();
}

export async function deactivate(): Promise<void> {
  if (client) {
    await client.stop();
    client = undefined;
  }
}
