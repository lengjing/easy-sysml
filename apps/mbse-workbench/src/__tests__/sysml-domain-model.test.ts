import { describe, it, expect } from 'vitest';
import { SymbolKind, type DocumentSymbol, type Range } from 'vscode-languageserver-protocol';
import {
  documentSymbolsToDomainModel,
  flattenElements,
  findElementById,
} from '../editor/sysml-domain-model';

function range(sl: number, sc: number, el: number, ec: number): Range {
  return { start: { line: sl, character: sc }, end: { line: el, character: ec } };
}

function makeSymbol(
  name: string,
  kind: SymbolKind,
  r: Range,
  detail?: string,
  children?: DocumentSymbol[],
): DocumentSymbol {
  return { name, kind, range: r, selectionRange: r, detail, children };
}

describe('sysml-domain-model', () => {
  describe('documentSymbolsToDomainModel', () => {
    it('converts a flat symbol list', () => {
      const symbols: DocumentSymbol[] = [
        makeSymbol('UAV_System', SymbolKind.Package, range(0, 0, 5, 1), 'package'),
      ];
      const model = documentSymbolsToDomainModel(symbols);
      expect(model.elements).toHaveLength(1);
      expect(model.elements[0].name).toBe('UAV_System');
      expect(model.elements[0].kind).toBe('Package');
      expect(model.elements[0].category).toBe('package');
      expect(model.elements[0].id).toBe('UAV_System');
    });

    it('converts nested symbols with children', () => {
      const symbols: DocumentSymbol[] = [
        makeSymbol('Pkg', SymbolKind.Package, range(0, 0, 10, 1), 'package', [
          makeSymbol('Motor', SymbolKind.Class, range(1, 2, 4, 3), 'part def'),
          makeSymbol('Battery', SymbolKind.Class, range(5, 2, 9, 3), 'part def'),
        ]),
      ];
      const model = documentSymbolsToDomainModel(symbols);
      expect(model.elements).toHaveLength(1);
      expect(model.elements[0].children).toHaveLength(2);
      expect(model.elements[0].children[0].id).toBe('Pkg::Motor');
      expect(model.elements[0].children[0].kind).toBe('PartDefinition');
      expect(model.elements[0].children[0].category).toBe('definition');
      expect(model.elements[0].children[1].id).toBe('Pkg::Battery');
    });

    it('classifies requirement definitions', () => {
      const symbols: DocumentSymbol[] = [
        makeSymbol('R1', SymbolKind.Class, range(0, 0, 3, 1), 'requirement def'),
      ];
      const model = documentSymbolsToDomainModel(symbols);
      expect(model.elements[0].kind).toBe('RequirementDefinition');
      expect(model.elements[0].category).toBe('requirement');
    });

    it('classifies action usages', () => {
      const symbols: DocumentSymbol[] = [
        makeSymbol('fly', SymbolKind.Method, range(0, 0, 3, 1), 'action'),
      ];
      const model = documentSymbolsToDomainModel(symbols);
      expect(model.elements[0].kind).toBe('ActionUsage');
      expect(model.elements[0].category).toBe('behavior');
    });

    it('classifies constraint definitions', () => {
      const symbols: DocumentSymbol[] = [
        makeSymbol('maxWeight', SymbolKind.Class, range(0, 0, 3, 1), 'constraint def'),
      ];
      const model = documentSymbolsToDomainModel(symbols);
      expect(model.elements[0].kind).toBe('ConstraintDefinition');
      expect(model.elements[0].category).toBe('constraint');
    });

    it('classifies port definitions', () => {
      const symbols: DocumentSymbol[] = [
        makeSymbol('p1', SymbolKind.Class, range(0, 0, 3, 1), 'port def'),
      ];
      const model = documentSymbolsToDomainModel(symbols);
      expect(model.elements[0].kind).toBe('PortDefinition');
      expect(model.elements[0].category).toBe('definition');
    });

    it('classifies state definitions', () => {
      const symbols: DocumentSymbol[] = [
        makeSymbol('idle', SymbolKind.Class, range(0, 0, 3, 1), 'state def'),
      ];
      const model = documentSymbolsToDomainModel(symbols);
      expect(model.elements[0].kind).toBe('StateDefinition');
      expect(model.elements[0].category).toBe('behavior');
    });

    it('falls back to SymbolKind-based classification', () => {
      const symbols: DocumentSymbol[] = [
        makeSymbol('ns', SymbolKind.Namespace, range(0, 0, 3, 1)),
      ];
      const model = documentSymbolsToDomainModel(symbols);
      expect(model.elements[0].kind).toBe('Namespace');
      expect(model.elements[0].category).toBe('package');
    });
  });

  describe('flattenElements', () => {
    it('flattens nested elements', () => {
      const symbols: DocumentSymbol[] = [
        makeSymbol('A', SymbolKind.Package, range(0, 0, 10, 1), 'package', [
          makeSymbol('B', SymbolKind.Class, range(1, 0, 5, 1), 'part def', [
            makeSymbol('C', SymbolKind.Field, range(2, 0, 3, 1), 'attribute'),
          ]),
        ]),
      ];
      const model = documentSymbolsToDomainModel(symbols);
      const flat = flattenElements(model.elements);
      expect(flat).toHaveLength(3);
      expect(flat.map(e => e.name)).toEqual(['A', 'B', 'C']);
    });
  });

  describe('findElementById', () => {
    it('finds deeply nested elements', () => {
      const symbols: DocumentSymbol[] = [
        makeSymbol('X', SymbolKind.Package, range(0, 0, 10, 1), 'package', [
          makeSymbol('Y', SymbolKind.Class, range(1, 0, 5, 1), 'part def', [
            makeSymbol('Z', SymbolKind.Field, range(2, 0, 3, 1), 'attribute'),
          ]),
        ]),
      ];
      const model = documentSymbolsToDomainModel(symbols);
      const found = findElementById(model.elements, 'X::Y::Z');
      expect(found).toBeDefined();
      expect(found!.name).toBe('Z');
    });

    it('returns undefined for non-existent ids', () => {
      const model = documentSymbolsToDomainModel([]);
      expect(findElementById(model.elements, 'nonexistent')).toBeUndefined();
    });
  });
});
