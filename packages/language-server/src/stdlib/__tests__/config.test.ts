import { describe, it, expect } from 'vitest';
import {
  STDLIB_DEPENDENCY_LAYERS,
  STDLIB_FILE_COUNT,
  getStdlibFiles,
  isStdlibFile,
} from '../config.js';

describe('stdlib config', () => {
  it('has 95 files total', () => {
    expect(STDLIB_FILE_COUNT).toBe(95);
  });

  it('has 40 dependency layers', () => {
    expect(STDLIB_DEPENDENCY_LAYERS).toHaveLength(40);
  });

  it('getStdlibFiles returns flat list of all files', () => {
    const files = getStdlibFiles();
    expect(files).toHaveLength(95);
    expect(files[0]).toBe('Base.kerml');
    expect(files[files.length - 1]).toBe('DerivationConnections.sysml');
  });

  it('has no duplicate filenames', () => {
    const files = getStdlibFiles();
    const uniqueFiles = new Set(files);
    expect(uniqueFiles.size).toBe(files.length);
  });

  it('all files have .kerml or .sysml extension', () => {
    const files = getStdlibFiles();
    for (const file of files) {
      expect(file.endsWith('.kerml') || file.endsWith('.sysml')).toBe(true);
    }
  });

  it('isStdlibFile correctly identifies stdlib files', () => {
    expect(isStdlibFile('Base.kerml')).toBe(true);
    expect(isStdlibFile('SysML.sysml')).toBe(true);
    expect(isStdlibFile('NotAFile.sysml')).toBe(false);
    expect(isStdlibFile('/some/path/Base.kerml')).toBe(true);
  });

  it('starts with Base.kerml as the root layer', () => {
    expect(STDLIB_DEPENDENCY_LAYERS[0]).toEqual(['Base.kerml']);
  });

  it('ends with RequirementDerivation layer', () => {
    const lastLayer = STDLIB_DEPENDENCY_LAYERS[STDLIB_DEPENDENCY_LAYERS.length - 1];
    expect(lastLayer).toContain('RequirementDerivation.sysml');
    expect(lastLayer).toContain('DerivationConnections.sysml');
  });

  it('KerML.kerml is in layer 11 (index 10)', () => {
    expect(STDLIB_DEPENDENCY_LAYERS[10]).toEqual(['KerML.kerml']);
  });

  it('SysML.sysml is in layer 23 (index 22)', () => {
    expect(STDLIB_DEPENDENCY_LAYERS[22]).toEqual(['SysML.sysml']);
  });
});
