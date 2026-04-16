import { describe, it, expect } from 'vitest';
import { getStdlibPath, STDLIB_DEPENDENCY_LAYERS } from '../config.js';
import { loadStdlib, getStdlibFileList } from '../loader.js';

describe('StdlibConfig', () => {
  it('should provide stdlib path', () => {
    const path = getStdlibPath();
    expect(typeof path).toBe('string');
    expect(path.length).toBeGreaterThan(0);
  });

  it('should have dependency layers', () => {
    expect(STDLIB_DEPENDENCY_LAYERS.length).toBeGreaterThan(0);
  });

  it('should list all stdlib files', () => {
    const files = getStdlibFileList();
    expect(files.length).toBeGreaterThan(80);
  });
});

describe('StdlibLoader', () => {
  it('should load stdlib files', async () => {
    const result = await loadStdlib();
    // Some files may not exist in our copy, but the loader should work
    expect(result.loadTimeMs).toBeGreaterThanOrEqual(0);
    expect(result.files.length).toBeGreaterThan(0);
  });

  it('should load files in dependency order', async () => {
    const result = await loadStdlib();
    // Verify layers are ordered
    for (let i = 1; i < result.files.length; i++) {
      const prev = result.files[i - 1];
      const curr = result.files[i];
      // Files from earlier layers should come first
      expect(prev.layer).toBeLessThanOrEqual(curr.layer);
    }
  });

  it('should support partial layer loading', async () => {
    const result = await loadStdlib({ layers: 2 });
    // Should only load first 2 layers
    for (const file of result.files) {
      expect(file.layer).toBeLessThan(2);
    }
  });
});
