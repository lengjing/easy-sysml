import { describe, it, expect } from 'vitest';
import {
    STDLIB_DEPENDENCY_LAYERS,
    STDLIB_FILE_COUNT,
    getStdlibFiles,
    isStdlibFile,
} from '../src/config.js';

describe('stdlib config', () => {
    it('should have 94 files in total', () => {
        expect(STDLIB_FILE_COUNT).toBe(94);
    });

    it('should return all files via getStdlibFiles()', () => {
        const files = getStdlibFiles();
        expect(files).toHaveLength(94);
        expect(files[0]).toBe('Base.kerml');
    });

    it('should contain no duplicates', () => {
        const files = getStdlibFiles();
        const unique = new Set(files);
        expect(unique.size).toBe(files.length);
    });

    it('should have Base.kerml in the first layer', () => {
        expect(STDLIB_DEPENDENCY_LAYERS[0]).toEqual(['Base.kerml']);
    });

    it('should identify stdlib files correctly', () => {
        expect(isStdlibFile('Base.kerml')).toBe(true);
        expect(isStdlibFile('ScalarValues.kerml')).toBe(true);
        expect(isStdlibFile('Parts.sysml')).toBe(true);
        expect(isStdlibFile('Unknown.sysml')).toBe(false);
    });

    it('should handle path-like filenames', () => {
        expect(isStdlibFile('/some/path/Base.kerml')).toBe(true);
        expect(isStdlibFile('some/path/Unknown.kerml')).toBe(false);
    });

    it('every file should end with .kerml or .sysml', () => {
        for (const file of getStdlibFiles()) {
            expect(
                file.endsWith('.kerml') || file.endsWith('.sysml'),
            ).toBe(true);
        }
    });
});
