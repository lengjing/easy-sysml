import { describe, it, expect } from 'vitest';
import { SymbolKind, type DocumentSymbol, type Range } from 'vscode-languageserver-protocol';

/**
 * Tests for the useSysMLParser hook logic (buildGraph / displayType).
 * Since the hook uses React state, we test the underlying domain model
 * conversion and graph-building logic through the domain model module.
 */
import {
  documentSymbolsToDomainModel,
} from '../components/editor/sysml-domain-model';

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

describe('useSysMLParser (domain model integration)', () => {
  it('produces domain elements for a complete model', () => {
    const symbols: DocumentSymbol[] = [
      makeSymbol('VehicleSystem', SymbolKind.Package, range(0, 0, 30, 1), 'package', [
        makeSymbol('Engine', SymbolKind.Class, range(1, 2, 10, 3), 'part def', [
          makeSymbol('power', SymbolKind.Field, range(2, 4, 2, 30), 'attribute'),
          makeSymbol('fuelPort', SymbolKind.Variable, range(3, 4, 3, 30), 'port'),
        ]),
        makeSymbol('startEngine', SymbolKind.Method, range(11, 2, 15, 3), 'action'),
        makeSymbol('MaxSpeed', SymbolKind.Class, range(16, 2, 20, 3), 'requirement def'),
        makeSymbol('idle', SymbolKind.Class, range(21, 2, 25, 3), 'state def'),
      ]),
    ];

    const model = documentSymbolsToDomainModel(symbols);
    expect(model.elements).toHaveLength(1);

    const pkg = model.elements[0];
    expect(pkg.kind).toBe('Package');
    expect(pkg.children).toHaveLength(4);

    // Engine part def with attribute and port children
    const engine = pkg.children[0];
    expect(engine.kind).toBe('PartDefinition');
    expect(engine.children).toHaveLength(2);
    expect(engine.children[0].kind).toBe('AttributeUsage');
    expect(engine.children[1].kind).toBe('PortUsage');

    // Action usage
    expect(pkg.children[1].kind).toBe('ActionUsage');

    // Requirement definition
    expect(pkg.children[2].kind).toBe('RequirementDefinition');

    // State definition
    expect(pkg.children[3].kind).toBe('StateDefinition');
  });

  it('handles empty symbols gracefully', () => {
    const model = documentSymbolsToDomainModel([]);
    expect(model.elements).toHaveLength(0);
  });

  it('handles multiple top-level elements', () => {
    const symbols: DocumentSymbol[] = [
      makeSymbol('PkgA', SymbolKind.Package, range(0, 0, 5, 1), 'package'),
      makeSymbol('PkgB', SymbolKind.Package, range(6, 0, 10, 1), 'package'),
    ];
    const model = documentSymbolsToDomainModel(symbols);
    expect(model.elements).toHaveLength(2);
    expect(model.elements[0].id).toBe('PkgA');
    expect(model.elements[1].id).toBe('PkgB');
  });
});
