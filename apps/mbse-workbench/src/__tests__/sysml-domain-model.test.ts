import { describe, it, expect } from 'vitest';
import { SymbolKind, type DocumentSymbol, type Range } from 'vscode-languageserver-protocol';
import {
  documentSymbolsToDomainModel,
  flattenElements,
  findElementById,
} from '../components/editor/sysml-domain-model';

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

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

/* ------------------------------------------------------------------ */
/*  classifySymbol - AST $type (PascalCase from language server)      */
/* ------------------------------------------------------------------ */

describe('sysml-domain-model', () => {
  describe('classifySymbol - AST $type exact match', () => {
    const astTypeCases: [string, SymbolKind, string, string, string][] = [
      // Packages
      ['Package',                     SymbolKind.Package,   'Package',                     'package',      'Pkg'],
      ['LibraryPackage',              SymbolKind.Package,   'Package',                     'package',      'Lib'],

      // Definitions
      ['PartDefinition',              SymbolKind.Class,     'PartDefinition',              'definition',   'Motor'],
      ['AttributeDefinition',         SymbolKind.Class,     'AttributeDefinition',         'definition',   'Speed'],
      ['PortDefinition',              SymbolKind.Class,     'PortDefinition',              'definition',   'FuelPort'],
      ['InterfaceDefinition',         SymbolKind.Class,     'InterfaceDefinition',         'definition',   'DataBus'],
      ['ConnectionDefinition',        SymbolKind.Class,     'ConnectionDefinition',        'definition',   'Link'],
      ['AllocationDefinition',        SymbolKind.Class,     'AllocationDefinition',        'definition',   'HwAlloc'],
      ['FlowConnectionDefinition',    SymbolKind.Class,     'FlowConnectionDefinition',    'definition',   'DataFlow'],
      ['ItemDefinition',              SymbolKind.Class,     'ItemDefinition',              'definition',   'Bolt'],
      ['OccurrenceDefinition',        SymbolKind.Class,     'OccurrenceDefinition',        'definition',   'Event'],
      ['EnumerationDefinition',       SymbolKind.Class,     'EnumerationDefinition',       'definition',   'Color'],
      ['MetadataDefinition',          SymbolKind.Class,     'MetadataDefinition',          'definition',   'Tag'],
      ['ViewDefinition',              SymbolKind.Class,     'ViewDefinition',              'definition',   'Overview'],
      ['ViewpointDefinition',         SymbolKind.Class,     'ViewpointDefinition',         'definition',   'UserVP'],
      ['RenderingDefinition',         SymbolKind.Class,     'RenderingDefinition',         'definition',   'Render'],
      ['ActionDefinition',            SymbolKind.Method,    'ActionDefinition',            'behavior',     'Start'],
      ['StateDefinition',             SymbolKind.Method,    'StateDefinition',             'behavior',     'Idle'],
      ['CalculationDefinition',       SymbolKind.Function,  'CalculationDefinition',       'behavior',     'Calc'],
      ['ConstraintDefinition',        SymbolKind.Class,     'ConstraintDefinition',        'constraint',   'Limit'],
      ['RequirementDefinition',       SymbolKind.Class,     'RequirementDefinition',       'requirement',  'MaxSpeed'],
      ['ConcernDefinition',           SymbolKind.Class,     'ConcernDefinition',           'requirement',  'Safety'],
      ['CaseDefinition',              SymbolKind.Class,     'CaseDefinition',              'behavior',     'Test1'],
      ['AnalysisCaseDefinition',      SymbolKind.Class,     'AnalysisCaseDefinition',      'behavior',     'Perf'],
      ['VerificationCaseDefinition',  SymbolKind.Class,     'VerificationCaseDefinition',  'behavior',     'Verify'],
      ['UseCaseDefinition',           SymbolKind.Class,     'UseCaseDefinition',           'behavior',     'UseCase'],

      // Usages
      ['PartUsage',                   SymbolKind.Variable,  'PartUsage',                   'usage',        'engine'],
      ['AttributeUsage',              SymbolKind.Property,  'AttributeUsage',              'usage',        'power'],
      ['PortUsage',                   SymbolKind.Variable,  'PortUsage',                   'usage',        'fuelIn'],
      ['InterfaceUsage',              SymbolKind.Variable,  'InterfaceUsage',              'usage',        'bus1'],
      ['ConnectionUsage',             SymbolKind.Variable,  'ConnectionUsage',             'usage',        'link1'],
      ['AllocationUsage',             SymbolKind.Variable,  'AllocationUsage',             'usage',        'alloc1'],
      ['ItemUsage',                   SymbolKind.Variable,  'ItemUsage',                   'usage',        'bolt1'],
      ['EnumerationUsage',            SymbolKind.Variable,  'EnumerationUsage',            'usage',        'red'],
      ['ReferenceUsage',              SymbolKind.Variable,  'ReferenceUsage',              'usage',        'ref1'],

      // Behavioral usages
      ['ActionUsage',                 SymbolKind.Method,    'ActionUsage',                 'behavior',     'move'],
      ['StateUsage',                  SymbolKind.Method,    'StateUsage',                  'behavior',     'idle'],
      ['CalculationUsage',            SymbolKind.Function,  'CalculationUsage',            'behavior',     'calc1'],
      ['ConstraintUsage',             SymbolKind.Variable,  'ConstraintUsage',             'constraint',   'limit1'],
      ['RequirementUsage',            SymbolKind.Variable,  'RequirementUsage',            'requirement',  'req1'],
      ['ConcernUsage',                SymbolKind.Variable,  'ConcernUsage',                'requirement',  'concern1'],
      ['ExhibitStateUsage',           SymbolKind.Method,    'ExhibitStateUsage',           'behavior',     'exhibit1'],
      ['PerformActionUsage',          SymbolKind.Method,    'PerformActionUsage',          'behavior',     'perform1'],
      ['AcceptActionUsage',           SymbolKind.Method,    'AcceptActionUsage',           'behavior',     'accept1'],
      ['SendActionUsage',             SymbolKind.Method,    'SendActionUsage',             'behavior',     'send1'],
      ['AssignmentActionUsage',       SymbolKind.Method,    'AssignmentActionUsage',       'behavior',     'assign1'],
      ['IfActionUsage',               SymbolKind.Method,    'IfActionUsage',               'behavior',     'if1'],
      ['WhileLoopActionUsage',        SymbolKind.Method,    'WhileLoopActionUsage',        'behavior',     'while1'],
      ['ForLoopActionUsage',          SymbolKind.Method,    'ForLoopActionUsage',          'behavior',     'for1'],
      ['TransitionUsage',             SymbolKind.Method,    'TransitionUsage',             'behavior',     'trans1'],
      ['SatisfyRequirementUsage',     SymbolKind.Variable,  'SatisfyRequirementUsage',     'relationship', 'sat1'],
      ['AssertConstraintUsage',       SymbolKind.Variable,  'AssertConstraintUsage',       'constraint',   'assert1'],

      // Relationships
      ['BindingConnector',            SymbolKind.Variable,  'BindingConnector',            'relationship', 'bind1'],
      ['Succession',                  SymbolKind.Variable,  'Succession',                  'relationship', 'succ1'],
    ];

    it.each(astTypeCases)(
      'AST $type "%s" -> kind=%s category=%s',
      (detail, _symbolKind, expectedKind, expectedCategory, name) => {
        const symbols: DocumentSymbol[] = [
          makeSymbol(name, SymbolKind.Class, range(0, 0, 3, 1), detail),
        ];
        const model = documentSymbolsToDomainModel(symbols);
        expect(model.elements[0].kind).toBe(expectedKind);
        expect(model.elements[0].category).toBe(expectedCategory);
      },
    );
  });

  /* ---------------------------------------------------------------- */
  /*  classifySymbol - keyword-style detail strings                   */
  /* ---------------------------------------------------------------- */

  describe('documentSymbolsToDomainModel - definitions (keyword-style)', () => {
    const defCases: [string, string, string, string][] = [
      ['part def',             'PartDefinition',             'definition', 'PartDef'],
      ['attribute def',        'AttributeDefinition',        'definition', 'AttrDef'],
      ['port def',             'PortDefinition',             'definition', 'PortDef'],
      ['interface def',        'InterfaceDefinition',        'definition', 'IfDef'],
      ['connection def',       'ConnectionDefinition',       'definition', 'ConnDef'],
      ['allocation def',       'AllocationDefinition',       'definition', 'AllocDef'],
      ['action def',           'ActionDefinition',           'behavior',  'ActDef'],
      ['state def',            'StateDefinition',            'behavior',  'StDef'],
      ['calculation def',      'CalculationDefinition',      'behavior',  'CalcDef'],
      ['constraint def',       'ConstraintDefinition',       'constraint','ConstrDef'],
      ['requirement def',      'RequirementDefinition',      'requirement','ReqDef'],
      ['concern def',          'ConcernDefinition',          'requirement','ConcernDef'],
      ['case def',             'CaseDefinition',             'behavior',  'CaseDef'],
      ['analysis case def',    'AnalysisCaseDefinition',     'behavior',  'AcDef'],
      ['verification case def','VerificationCaseDefinition', 'behavior',  'VcDef'],
      ['use case def',         'UseCaseDefinition',          'behavior',  'UcDef'],
      ['view def',             'ViewDefinition',             'definition', 'VwDef'],
      ['viewpoint def',        'ViewpointDefinition',        'definition', 'VpDef'],
      ['rendering def',        'RenderingDefinition',        'definition', 'RnDef'],
      ['metadata def',         'MetadataDefinition',         'definition', 'MdDef'],
      ['occurrence def',       'OccurrenceDefinition',       'definition', 'OcDef'],
      ['item def',             'ItemDefinition',             'definition', 'ItDef'],
      ['enum def',             'EnumerationDefinition',      'definition', 'EnDef'],
      ['flow connection def',  'FlowConnectionDefinition',   'definition', 'FlDef'],
    ];

    it.each(defCases)(
      'classifies "%s" as %s (%s)',
      (detail, expectedKind, expectedCategory, name) => {
        const symbols: DocumentSymbol[] = [
          makeSymbol(name, SymbolKind.Class, range(0, 0, 3, 1), detail),
        ];
        const model = documentSymbolsToDomainModel(symbols);
        expect(model.elements[0].kind).toBe(expectedKind);
        expect(model.elements[0].category).toBe(expectedCategory);
      },
    );
  });

  describe('documentSymbolsToDomainModel - usages (keyword-style)', () => {
    const usageCases: [string, string, string, string][] = [
      ['part',        'PartUsage',            'usage',      'p1'],
      ['attribute',   'AttributeUsage',       'usage',      'a1'],
      ['port',        'PortUsage',            'usage',      'pt1'],
      ['interface',   'InterfaceUsage',       'usage',      'if1'],
      ['connection',  'ConnectionUsage',      'usage',      'cn1'],
      ['allocation',  'AllocationUsage',      'usage',      'al1'],
      ['action',      'ActionUsage',          'behavior',   'ac1'],
      ['state',       'StateUsage',           'behavior',   'st1'],
      ['calculation', 'CalculationUsage',     'behavior',   'cl1'],
      ['constraint',  'ConstraintUsage',      'constraint', 'ct1'],
      ['requirement', 'RequirementUsage',     'requirement','rq1'],
      ['concern',     'ConcernUsage',         'requirement','cc1'],
      ['item',        'ItemUsage',            'usage',      'it1'],
      ['ref',         'ReferenceUsage',       'usage',      'rf1'],
      ['flow',        'FlowConnectionUsage',  'usage',      'fl1'],
      ['exhibit',     'ExhibitStateUsage',    'behavior',   'ex1'],
      ['perform',     'PerformActionUsage',   'behavior',   'pf1'],
      ['satisfy',     'SatisfyRequirementUsage','relationship','sf1'],
      ['assert',      'AssertConstraintUsage','constraint',  'as1'],
      ['bind',        'BindingConnector',     'relationship','bd1'],
      ['succession',  'Succession',           'relationship','sc1'],
      ['transition',  'TransitionUsage',      'behavior',   'tr1'],
      ['send',        'SendActionUsage',      'behavior',   'sn1'],
      ['accept',      'AcceptActionUsage',    'behavior',   'ap1'],
      ['assign',      'AssignmentActionUsage','behavior',   'ag1'],
      ['if',          'IfActionUsage',        'behavior',   'if2'],
      ['for',         'ForLoopActionUsage',   'behavior',   'fr1'],
      ['while',       'WhileLoopActionUsage', 'behavior',   'wh1'],
      ['enum',        'EnumerationUsage',     'usage',      'en1'],
    ];

    it.each(usageCases)(
      'classifies "%s" as %s (%s)',
      (detail, expectedKind, expectedCategory, name) => {
        const symbols: DocumentSymbol[] = [
          makeSymbol(name, SymbolKind.Variable, range(0, 0, 3, 1), detail),
        ];
        const model = documentSymbolsToDomainModel(symbols);
        expect(model.elements[0].kind).toBe(expectedKind);
        expect(model.elements[0].category).toBe(expectedCategory);
      },
    );
  });

  describe('documentSymbolsToDomainModel - packages', () => {
    it('classifies "package"', () => {
      const model = documentSymbolsToDomainModel([
        makeSymbol('Pkg', SymbolKind.Package, range(0, 0, 5, 1), 'package'),
      ]);
      expect(model.elements[0].kind).toBe('Package');
      expect(model.elements[0].category).toBe('package');
    });

    it('classifies "library package"', () => {
      const model = documentSymbolsToDomainModel([
        makeSymbol('Lib', SymbolKind.Package, range(0, 0, 5, 1), 'library package'),
      ]);
      expect(model.elements[0].kind).toBe('Package');
      expect(model.elements[0].category).toBe('package');
    });
  });

  describe('documentSymbolsToDomainModel - SymbolKind fallbacks', () => {
    const fallbackCases: [string, SymbolKind, string, string][] = [
      ['Package fallback',   SymbolKind.Package,   'Package',     'package'],
      ['Class fallback',     SymbolKind.Class,     'Definition',  'definition'],
      ['Method fallback',    SymbolKind.Method,    'Action',      'behavior'],
      ['Property fallback',  SymbolKind.Property,  'Attribute',   'usage'],
      ['Field fallback',     SymbolKind.Field,     'Attribute',   'usage'],
      ['Function fallback',  SymbolKind.Function,  'Calculation', 'behavior'],
      ['Variable fallback',  SymbolKind.Variable,  'Usage',       'usage'],
      ['Module fallback',    SymbolKind.Module,    'Namespace',   'package'],
      ['Namespace fallback', SymbolKind.Namespace, 'Namespace',   'package'],
    ];

    it.each(fallbackCases)(
      '%s -> %s (%s)',
      (_desc, symbolKind, expectedKind, expectedCategory) => {
        const model = documentSymbolsToDomainModel([
          makeSymbol('x', symbolKind, range(0, 0, 1, 1)),
        ]);
        expect(model.elements[0].kind).toBe(expectedKind);
        expect(model.elements[0].category).toBe(expectedCategory);
      },
    );
  });

  /* ---------------------------------------------------------------- */
  /*  Keyword-style ordering: compound keywords must not be swallowed */
  /* ---------------------------------------------------------------- */

  describe('keyword ordering - compound usages not misclassified', () => {
    it('"flow connection" is FlowConnectionUsage, not ConnectionUsage', () => {
      const model = documentSymbolsToDomainModel([
        makeSymbol('f1', SymbolKind.Variable, range(0, 0, 1, 1), 'flow connection'),
      ]);
      // "flow" is checked before "connection" in the usage block
      expect(model.elements[0].kind).toBe('FlowConnectionUsage');
    });

    it('"perform action" is PerformActionUsage, not ActionUsage', () => {
      const model = documentSymbolsToDomainModel([
        makeSymbol('pa', SymbolKind.Variable, range(0, 0, 1, 1), 'perform action'),
      ]);
      expect(model.elements[0].kind).toBe('PerformActionUsage');
    });

    it('"exhibit state" is ExhibitStateUsage, not StateUsage', () => {
      const model = documentSymbolsToDomainModel([
        makeSymbol('es', SymbolKind.Variable, range(0, 0, 1, 1), 'exhibit state'),
      ]);
      expect(model.elements[0].kind).toBe('ExhibitStateUsage');
    });

    it('"send action" is SendActionUsage, not ActionUsage', () => {
      const model = documentSymbolsToDomainModel([
        makeSymbol('sa', SymbolKind.Variable, range(0, 0, 1, 1), 'send action'),
      ]);
      expect(model.elements[0].kind).toBe('SendActionUsage');
    });

    it('"accept action" is AcceptActionUsage, not ActionUsage', () => {
      const model = documentSymbolsToDomainModel([
        makeSymbol('aa', SymbolKind.Variable, range(0, 0, 1, 1), 'accept action'),
      ]);
      expect(model.elements[0].kind).toBe('AcceptActionUsage');
    });

    it('"satisfy requirement" is SatisfyRequirementUsage, not RequirementUsage', () => {
      const model = documentSymbolsToDomainModel([
        makeSymbol('sr', SymbolKind.Variable, range(0, 0, 1, 1), 'satisfy requirement'),
      ]);
      expect(model.elements[0].kind).toBe('SatisfyRequirementUsage');
    });

    it('"assert constraint" is AssertConstraintUsage, not ConstraintUsage', () => {
      const model = documentSymbolsToDomainModel([
        makeSymbol('ac', SymbolKind.Variable, range(0, 0, 1, 1), 'assert constraint'),
      ]);
      expect(model.elements[0].kind).toBe('AssertConstraintUsage');
    });
  });

  describe('documentSymbolsToDomainModel - structure', () => {
    it('converts a flat symbol list', () => {
      const symbols: DocumentSymbol[] = [
        makeSymbol('UAV_System', SymbolKind.Package, range(0, 0, 5, 1), 'package'),
      ];
      const model = documentSymbolsToDomainModel(symbols);
      expect(model.elements).toHaveLength(1);
      expect(model.elements[0].name).toBe('UAV_System');
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
      expect(model.elements[0].children[1].id).toBe('Pkg::Battery');
    });

    it('converts deeply nested (3 levels)', () => {
      const symbols: DocumentSymbol[] = [
        makeSymbol('A', SymbolKind.Package, range(0, 0, 20, 1), 'package', [
          makeSymbol('B', SymbolKind.Class, range(1, 0, 10, 1), 'part def', [
            makeSymbol('c', SymbolKind.Field, range(2, 0, 3, 1), 'attribute'),
          ]),
        ]),
      ];
      const model = documentSymbolsToDomainModel(symbols);
      expect(model.elements[0].children[0].children[0].id).toBe('A::B::c');
      expect(model.elements[0].children[0].children[0].kind).toBe('AttributeUsage');
    });

    it('sets correct range and selectionRange (1-based)', () => {
      const model = documentSymbolsToDomainModel([
        makeSymbol('X', SymbolKind.Class, range(2, 4, 10, 1), 'part def'),
      ]);
      expect(model.elements[0].range).toEqual({
        startLine: 3, startColumn: 5, endLine: 11, endColumn: 2,
      });
    });

    it('returns empty model for empty input', () => {
      const model = documentSymbolsToDomainModel([]);
      expect(model.elements).toHaveLength(0);
    });
  });

  describe('flattenElements', () => {
    it('flattens nested elements', () => {
      const model = documentSymbolsToDomainModel([
        makeSymbol('A', SymbolKind.Package, range(0, 0, 10, 1), 'package', [
          makeSymbol('B', SymbolKind.Class, range(1, 0, 5, 1), 'part def', [
            makeSymbol('C', SymbolKind.Field, range(2, 0, 3, 1), 'attribute'),
          ]),
        ]),
      ]);
      const flat = flattenElements(model.elements);
      expect(flat).toHaveLength(3);
      expect(flat.map(e => e.name)).toEqual(['A', 'B', 'C']);
    });

    it('returns empty for empty input', () => {
      expect(flattenElements([])).toHaveLength(0);
    });
  });

  describe('findElementById', () => {
    it('finds deeply nested elements', () => {
      const model = documentSymbolsToDomainModel([
        makeSymbol('X', SymbolKind.Package, range(0, 0, 10, 1), 'package', [
          makeSymbol('Y', SymbolKind.Class, range(1, 0, 5, 1), 'part def', [
            makeSymbol('Z', SymbolKind.Field, range(2, 0, 3, 1), 'attribute'),
          ]),
        ]),
      ]);
      const found = findElementById(model.elements, 'X::Y::Z');
      expect(found).toBeDefined();
      expect(found!.name).toBe('Z');
    });

    it('finds root element', () => {
      const model = documentSymbolsToDomainModel([
        makeSymbol('Root', SymbolKind.Package, range(0, 0, 5, 1), 'package'),
      ]);
      expect(findElementById(model.elements, 'Root')?.name).toBe('Root');
    });

    it('returns undefined for non-existent ids', () => {
      const model = documentSymbolsToDomainModel([]);
      expect(findElementById(model.elements, 'nonexistent')).toBeUndefined();
    });
  });
});
