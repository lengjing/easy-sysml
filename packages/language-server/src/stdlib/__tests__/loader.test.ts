import { describe, it, expect } from 'vitest';
import { findStdlibPath } from '../loader.js';
import * as fs from 'fs';
import * as path from 'path';

describe('stdlib loader', () => {
  it('findStdlibPath locates the lib directory', () => {
    const stdlibPath = findStdlibPath();

    expect(stdlibPath).not.toBeNull();
    // Verify it contains the marker file
    expect(fs.existsSync(path.join(stdlibPath!, 'Base.kerml'))).toBe(true);
  });

  it('stdlib directory contains all expected files', () => {
    const stdlibPath = findStdlibPath();
    expect(stdlibPath).not.toBeNull();

    const files = fs.readdirSync(stdlibPath!);
    const sysmlFiles = files.filter((f) => f.endsWith('.sysml') || f.endsWith('.kerml'));

    expect(sysmlFiles.length).toBe(94);
  });

  it('Base.kerml is a valid KerML file', () => {
    const stdlibPath = findStdlibPath();
    expect(stdlibPath).not.toBeNull();

    const content = fs.readFileSync(path.join(stdlibPath!, 'Base.kerml'), 'utf-8');
    expect(content).toContain('package Base');
  });
});
