import { describe, it, expect } from 'vitest';
import { getStylePalette, type StylePalette } from '../components/SysMLNode';

describe('SysMLNode', () => {
  describe('getStylePalette', () => {
    const paletteTypes = [
      'Package', 'Block', 'Part', 'Port', 'Interface', 'Allocation',
      'Action', 'PerformAction', 'State', 'ExhibitState', 'Transition',
      'Calculation', 'Requirement', 'Concern', 'Satisfy',
      'Constraint', 'Assert', 'Case', 'UseCase', 'AnalysisCase',
      'VerificationCase', 'Item', 'Enumeration', 'View', 'Viewpoint',
      'Rendering', 'Metadata', 'Flow',
    ];

    it.each(paletteTypes)('returns a valid palette for %s', (type) => {
      const palette: StylePalette = getStylePalette(type);
      expect(palette.header).toBeTruthy();
      expect(palette.headerText).toBeTruthy();
      expect(palette.border).toBeTruthy();
      expect(palette.accent).toBeTruthy();
    });

    it('returns default palette for unknown type', () => {
      const palette = getStylePalette('UnknownType');
      expect(palette.header).toContain('slate');
    });

    it('shares palette for Action and PerformAction', () => {
      expect(getStylePalette('Action').header).toBe(getStylePalette('PerformAction').header);
    });

    it('shares palette for State, ExhibitState, Transition', () => {
      const s = getStylePalette('State').header;
      expect(getStylePalette('ExhibitState').header).toBe(s);
      expect(getStylePalette('Transition').header).toBe(s);
    });

    it('shares palette for Requirement, Concern, Satisfy', () => {
      const r = getStylePalette('Requirement').header;
      expect(getStylePalette('Concern').header).toBe(r);
      expect(getStylePalette('Satisfy').header).toBe(r);
    });
  });
});
