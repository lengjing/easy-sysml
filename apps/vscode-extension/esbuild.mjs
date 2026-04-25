import * as esbuild from 'esbuild';
import { cpSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const production = process.argv.includes('--production');

// Bundle the extension client
await esbuild.build({
  entryPoints: ['src/extension.ts'],
  bundle: true,
  outfile: 'dist/extension.js',
  external: ['vscode'],
  format: 'cjs',
  platform: 'node',
  sourcemap: !production,
  minify: production,
  target: 'node18',
});

// Bundle the language server into dist/server.js so the extension can find it
// without relying on monorepo path conventions.
await esbuild.build({
  entryPoints: [resolve(__dirname, '../../packages/language-server/src/main.ts')],
  bundle: true,
  outfile: 'dist/server.js',
  format: 'cjs',
  platform: 'node',
  sourcemap: !production,
  minify: production,
  target: 'node18',
  // esbuild resolves workspace symlinks; mark only native addons as external
  external: ['*.node'],
});

// Copy the SysML/KerML stdlib files into lib/ so the bundled server can find
// them at runtime via SYSML_STDLIB_PATH (set in extension.ts).
const stdlibSrc = resolve(__dirname, '../../packages/language-server/lib');
const stdlibDest = resolve(__dirname, 'lib');
mkdirSync(stdlibDest, { recursive: true });
cpSync(stdlibSrc, stdlibDest, { recursive: true });

console.log('Build complete: dist/extension.js, dist/server.js, lib/');
