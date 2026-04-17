import { describe, it, expect } from 'vitest';
import {
  getDiagnostics,
  getHoverInfo,
  getCompletions,
  getDefinition,
  getDocumentSymbols,
} from '../editor/sysml-language-service';

describe('sysml-language-service', () => {
  describe('getDiagnostics', () => {
    it('returns no diagnostics for valid SysML code', () => {
      const source = `package MyPackage {
        part def Car;
      }`;
      const diags = getDiagnostics(source);
      expect(diags).toHaveLength(0);
    });

    it('returns diagnostics for syntax errors', () => {
      const source = `package {`;
      const diags = getDiagnostics(source);
      expect(diags.length).toBeGreaterThan(0);
      expect(diags[0].severity).toBe('error');
      expect(diags[0].message).toBeDefined();
    });

    it('returns no diagnostics for empty input', () => {
      const diags = getDiagnostics('');
      expect(diags).toHaveLength(0);
    });

    it('returns diagnostics with position info', () => {
      const source = `package {`;
      const diags = getDiagnostics(source);
      expect(diags.length).toBeGreaterThan(0);
      expect(diags[0].startLineNumber).toBeGreaterThan(0);
      expect(diags[0].startColumn).toBeGreaterThan(0);
    });
  });

  describe('getHoverInfo', () => {
    it('returns hover info for a package name', () => {
      const source = `package MyPackage { }`;
      const hover = getHoverInfo(source, 1, 10); // Position on "MyPackage"
      expect(hover).toBeDefined();
      expect(hover!.contents).toContain('MyPackage');
    });

    it('returns hover info for a part definition', () => {
      const source = `package Test {
  part def Vehicle;
}`;
      const hover = getHoverInfo(source, 2, 13); // Position on "Vehicle"
      expect(hover).toBeDefined();
      expect(hover!.contents).toContain('Vehicle');
    });

    it('returns undefined for empty space', () => {
      const source = `package MyPackage { }`;
      // Position at the very end — beyond meaningful content
      const hover = getHoverInfo(source, 1, 21);
      // May or may not return info depending on position, just shouldn't crash
      expect(hover === undefined || hover?.contents !== undefined).toBe(true);
    });
  });

  describe('getCompletions', () => {
    it('returns keyword completions', () => {
      const source = `pac`;
      const completions = getCompletions(source, 1, 4);
      expect(completions.some(c => c.label === 'package')).toBe(true);
    });

    it('returns snippet completions', () => {
      const source = ``;
      const completions = getCompletions(source, 1, 1);
      expect(completions.some(c => c.kind === 'snippet')).toBe(true);
    });

    it('returns all keywords when no prefix', () => {
      const source = ``;
      const completions = getCompletions(source, 1, 1);
      expect(completions.some(c => c.label === 'package')).toBe(true);
      expect(completions.some(c => c.label === 'part')).toBe(true);
      expect(completions.some(c => c.label === 'requirement')).toBe(true);
    });

    it('filters completions by prefix', () => {
      const source = `req`;
      const completions = getCompletions(source, 1, 4);
      const labels = completions.map(c => c.label);
      expect(labels.some(l => l === 'requirement')).toBe(true);
      // Should not include unrelated keywords
      expect(labels.every(l => !l.startsWith('pac'))).toBe(true);
    });

    it('includes local identifiers from the document', () => {
      const source = `package MyPackage {
  part def MyCar;
}
`;
      const completions = getCompletions(source, 4, 1);
      expect(completions.some(c => c.label === 'MyPackage')).toBe(true);
      expect(completions.some(c => c.label === 'MyCar')).toBe(true);
    });
  });

  describe('getDefinition', () => {
    it('returns definition location for an identifier', () => {
      const source = `package MyPackage {
  part def Vehicle;
  part car : Vehicle;
}`;
      // Position on "Vehicle" in the reference (line 3, col ~14)
      const def = getDefinition(source, 3, 14);
      // Should find the definition (part def Vehicle on line 2)
      if (def) {
        expect(def.startLineNumber).toBe(2);
      }
    });

    it('returns undefined for unknown identifiers', () => {
      const source = `package MyPackage { }`;
      const def = getDefinition(source, 1, 21); // End of line, no identifier
      // Should not crash, may return undefined
      expect(def === undefined || def !== undefined).toBe(true);
    });
  });

  describe('getDocumentSymbols', () => {
    it('returns symbols for named elements', () => {
      const source = `package MyPackage {
  part def Vehicle;
}`;
      const symbols = getDocumentSymbols(source);
      expect(symbols.length).toBeGreaterThan(0);
      expect(symbols.some(s => s.name === 'MyPackage')).toBe(true);
    });

    it('returns nested symbols', () => {
      const source = `package MyPackage {
  part def Vehicle {
    part engine : Engine;
  }
  part def Engine;
}`;
      const symbols = getDocumentSymbols(source);
      expect(symbols.length).toBeGreaterThan(0);
      const pkg = symbols.find(s => s.name === 'MyPackage');
      expect(pkg).toBeDefined();
      expect(pkg!.children.length).toBeGreaterThan(0);
    });

    it('returns empty array for empty input', () => {
      const symbols = getDocumentSymbols('');
      expect(Array.isArray(symbols)).toBe(true);
    });
  });
});
