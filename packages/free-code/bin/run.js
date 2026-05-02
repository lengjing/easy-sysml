#!/usr/bin/env node
/**
 * Cross-platform launcher for the free-code CLI binary.
 *
 * When `bun build --compile` runs on Windows it produces `cli.exe` rather than
 * `cli`. npm's `bin` field cannot be platform-conditional, so this shim detects
 * the host platform and spawns the correct binary from the package root, making
 * `npm link packages/free-code` work on Windows and Unix/macOS alike.
 */
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ext = process.platform === 'win32' ? '.exe' : '';
const binaryPath = join(__dirname, '..', `cli${ext}`);

const child = spawn(binaryPath, process.argv.slice(2), {
  stdio: 'inherit',
  windowsHide: false,
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
  } else {
    process.exit(code ?? 0);
  }
});

child.on('error', (err) => {
  // eslint-disable-next-line no-console
  console.error(`Cannot start ${binaryPath}: ${err.message}`);
  process.exit(1);
});
