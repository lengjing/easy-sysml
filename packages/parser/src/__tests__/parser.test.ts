import { describe, it, expect, beforeEach } from 'vitest';
import { SysMLElementKind } from '@easy-sysml/protocol';
import { resetAnonymousCounter } from '@easy-sysml/ast';
import type { DefinitionNode, UsageNode, PackageNode, CommentNode, ImportNode } from '@easy-sysml/ast';
import { Lexer } from '../lexer.js';
import { Parser } from '../parser.js';

const lexer = new Lexer();
const parser = new Parser();

function parse(input: string) {
  const tokens = lexer.tokenize(input);
  return parser.parse(tokens, 'test://file.sysml');
}

beforeEach(() => {
  resetAnonymousCounter();
});

describe('Parser', () => {
  describe('package declarations', () => {
    it('parses a simple package', () => {
      const { ast, diagnostics } = parse('package Vehicle { }');
      expect(diagnostics).toHaveLength(0);
      const pkg = ast as PackageNode;
      expect(pkg.members).toHaveLength(1);
      const inner = pkg.members[0] as PackageNode;
      expect(inner.kind).toBe(SysMLElementKind.Package);
      expect(inner.name).toBe('Vehicle');
    });

    it('parses nested packages', () => {
      const { ast, diagnostics } = parse('package A { package B { } }');
      expect(diagnostics).toHaveLength(0);
      const a = (ast as PackageNode).members[0] as PackageNode;
      expect(a.name).toBe('A');
      expect(a.members).toHaveLength(1);
      expect(a.members[0].name).toBe('B');
    });
  });

  describe('part definitions', () => {
    it('parses a simple part def', () => {
      const { ast, diagnostics } = parse('part def Engine { }');
      expect(diagnostics).toHaveLength(0);
      const def = (ast as PackageNode).members[0] as DefinitionNode;
      expect(def.kind).toBe(SysMLElementKind.PartDefinition);
      expect(def.name).toBe('Engine');
    });

    it('parses part def with specialization', () => {
      const { ast, diagnostics } = parse('part def Car specializes Vehicle { }');
      expect(diagnostics).toHaveLength(0);
      const def = (ast as PackageNode).members[0] as DefinitionNode;
      expect(def.kind).toBe(SysMLElementKind.PartDefinition);
      expect(def.name).toBe('Car');
      expect(def.specializations).toEqual(['Vehicle']);
    });

    it('parses abstract part def', () => {
      const { ast, diagnostics } = parse('abstract part def Shape { }');
      expect(diagnostics).toHaveLength(0);
      const def = (ast as PackageNode).members[0] as DefinitionNode;
      expect(def.properties.isAbstract).toBe(true);
    });
  });

  describe('part usages', () => {
    it('parses part usage with typing', () => {
      const { ast, diagnostics } = parse('part engine : Engine;');
      expect(diagnostics).toHaveLength(0);
      const usage = (ast as PackageNode).members[0] as UsageNode;
      expect(usage.kind).toBe(SysMLElementKind.PartUsage);
      expect(usage.name).toBe('engine');
      expect(usage.typings).toEqual(['Engine']);
    });

    it('parses part usage with body', () => {
      const { ast, diagnostics } = parse('part engine : Engine { }');
      expect(diagnostics).toHaveLength(0);
      const usage = (ast as PackageNode).members[0] as UsageNode;
      expect(usage.kind).toBe(SysMLElementKind.PartUsage);
      expect(usage.name).toBe('engine');
    });
  });

  describe('attribute definitions and usages', () => {
    it('parses attribute def', () => {
      const { ast, diagnostics } = parse('attribute def Mass;');
      expect(diagnostics).toHaveLength(0);
      const def = (ast as PackageNode).members[0] as DefinitionNode;
      expect(def.kind).toBe(SysMLElementKind.AttributeDefinition);
      expect(def.name).toBe('Mass');
    });

    it('parses attribute usage with typing', () => {
      const { ast, diagnostics } = parse('attribute mass : Mass;');
      expect(diagnostics).toHaveLength(0);
      const usage = (ast as PackageNode).members[0] as UsageNode;
      expect(usage.kind).toBe(SysMLElementKind.AttributeUsage);
      expect(usage.name).toBe('mass');
      expect(usage.typings).toEqual(['Mass']);
    });
  });

  describe('port definitions and usages', () => {
    it('parses port def', () => {
      const { ast, diagnostics } = parse('port def FuelPort { }');
      expect(diagnostics).toHaveLength(0);
      const def = (ast as PackageNode).members[0] as DefinitionNode;
      expect(def.kind).toBe(SysMLElementKind.PortDefinition);
      expect(def.name).toBe('FuelPort');
    });

    it('parses port usage with typing', () => {
      const { ast, diagnostics } = parse('port fuelIn : FuelPort;');
      expect(diagnostics).toHaveLength(0);
      const usage = (ast as PackageNode).members[0] as UsageNode;
      expect(usage.kind).toBe(SysMLElementKind.PortUsage);
      expect(usage.name).toBe('fuelIn');
      expect(usage.typings).toEqual(['FuelPort']);
    });
  });

  describe('action, state, requirement definitions', () => {
    it('parses action def', () => {
      const { ast, diagnostics } = parse('action def Drive { }');
      expect(diagnostics).toHaveLength(0);
      const def = (ast as PackageNode).members[0] as DefinitionNode;
      expect(def.kind).toBe(SysMLElementKind.ActionDefinition);
    });

    it('parses action usage', () => {
      const { ast, diagnostics } = parse('action drive { }');
      expect(diagnostics).toHaveLength(0);
      const usage = (ast as PackageNode).members[0] as UsageNode;
      expect(usage.kind).toBe(SysMLElementKind.ActionUsage);
    });

    it('parses state def', () => {
      const { ast, diagnostics } = parse('state def Running { }');
      expect(diagnostics).toHaveLength(0);
      const def = (ast as PackageNode).members[0] as DefinitionNode;
      expect(def.kind).toBe(SysMLElementKind.StateDefinition);
    });

    it('parses state usage', () => {
      const { ast, diagnostics } = parse('state running { }');
      expect(diagnostics).toHaveLength(0);
      const usage = (ast as PackageNode).members[0] as UsageNode;
      expect(usage.kind).toBe(SysMLElementKind.StateUsage);
    });

    it('parses requirement def', () => {
      const { ast, diagnostics } = parse('requirement def SafetyReq { }');
      expect(diagnostics).toHaveLength(0);
      const def = (ast as PackageNode).members[0] as DefinitionNode;
      expect(def.kind).toBe(SysMLElementKind.RequirementDefinition);
    });

    it('parses requirement usage', () => {
      const { ast, diagnostics } = parse('requirement safety { }');
      expect(diagnostics).toHaveLength(0);
      const usage = (ast as PackageNode).members[0] as UsageNode;
      expect(usage.kind).toBe(SysMLElementKind.RequirementUsage);
    });
  });

  describe('other definitions', () => {
    it('parses connection def', () => {
      const { ast, diagnostics } = parse('connection def Link { }');
      expect(diagnostics).toHaveLength(0);
      const def = (ast as PackageNode).members[0] as DefinitionNode;
      expect(def.kind).toBe(SysMLElementKind.ConnectionDefinition);
    });

    it('parses item def', () => {
      const { ast, diagnostics } = parse('item def Bolt { }');
      expect(diagnostics).toHaveLength(0);
      const def = (ast as PackageNode).members[0] as DefinitionNode;
      expect(def.kind).toBe(SysMLElementKind.ItemDefinition);
    });

    it('parses item usage', () => {
      const { ast, diagnostics } = parse('item bolt : Bolt;');
      expect(diagnostics).toHaveLength(0);
      const usage = (ast as PackageNode).members[0] as UsageNode;
      expect(usage.kind).toBe(SysMLElementKind.ItemUsage);
    });

    it('parses enum def', () => {
      const { ast, diagnostics } = parse('enum def Color { }');
      expect(diagnostics).toHaveLength(0);
      const def = (ast as PackageNode).members[0] as DefinitionNode;
      expect(def.kind).toBe(SysMLElementKind.Enumeration);
      expect(def.name).toBe('Color');
    });

    it('parses constraint def', () => {
      const { ast, diagnostics } = parse('constraint def MaxSpeed { }');
      expect(diagnostics).toHaveLength(0);
      const def = (ast as PackageNode).members[0] as DefinitionNode;
      expect(def.kind).toBe(SysMLElementKind.Constraint);
    });
  });

  describe('imports', () => {
    it('parses wildcard import', () => {
      const { ast, diagnostics } = parse('import Pkg::*;');
      expect(diagnostics).toHaveLength(0);
      const imp = (ast as PackageNode).imports[0] as ImportNode;
      expect(imp.kind).toBe(SysMLElementKind.Import);
      expect(imp.importedNamespace).toBe('Pkg::*');
      expect(imp.isWildcard).toBe(true);
    });

    it('parses element import', () => {
      const { ast, diagnostics } = parse('import Pkg::Element;');
      expect(diagnostics).toHaveLength(0);
      const imp = (ast as PackageNode).imports[0] as ImportNode;
      expect(imp.importedNamespace).toBe('Pkg::Element');
      expect(imp.isWildcard).toBe(false);
    });
  });

  describe('comments', () => {
    it('parses comment about', () => {
      const { ast, diagnostics } = parse('comment about Engine /* This is the engine */');
      expect(diagnostics).toHaveLength(0);
      const comment = (ast as PackageNode).members[0] as CommentNode;
      expect(comment.kind).toBe(SysMLElementKind.Comment);
      expect(comment.body).toBe('This is the engine');
    });

    it('parses doc comment', () => {
      const { ast, diagnostics } = parse('doc /* Documentation text */');
      expect(diagnostics).toHaveLength(0);
      const doc = (ast as PackageNode).members[0];
      expect(doc.kind).toBe(SysMLElementKind.Documentation);
    });
  });

  describe('multiplicity', () => {
    it('parses [*] multiplicity', () => {
      const { ast, diagnostics } = parse('part engines [*] : Engine;');
      expect(diagnostics).toHaveLength(0);
      const usage = (ast as PackageNode).members[0] as UsageNode;
      expect(usage.multiplicity).toBeDefined();
      expect(usage.multiplicity!.upper).toBe('*');
    });

    it('parses [0..1] multiplicity', () => {
      const { ast, diagnostics } = parse('part engine [0..1] : Engine;');
      expect(diagnostics).toHaveLength(0);
      const usage = (ast as PackageNode).members[0] as UsageNode;
      expect(usage.multiplicity).toBeDefined();
      expect(usage.multiplicity!.lower).toBe(0);
      expect(usage.multiplicity!.upper).toBe(1);
    });

    it('parses [1..*] multiplicity', () => {
      const { ast, diagnostics } = parse('part wheels [1..*] : Wheel;');
      expect(diagnostics).toHaveLength(0);
      const usage = (ast as PackageNode).members[0] as UsageNode;
      expect(usage.multiplicity!.lower).toBe(1);
      expect(usage.multiplicity!.upper).toBe('*');
    });
  });

  describe('nested structures', () => {
    it('parses a realistic SysML model', () => {
      const input = `
        package Vehicle {
          part def Engine {
            attribute displacement : Real;
            port fuelIn : FuelPort;
          }
          part def Car specializes Vehicle {
            part engine : Engine;
          }
        }
      `;
      const { ast, diagnostics } = parse(input);
      expect(diagnostics).toHaveLength(0);

      const root = ast as PackageNode;
      const vehiclePkg = root.members[0] as PackageNode;
      expect(vehiclePkg.name).toBe('Vehicle');
      expect(vehiclePkg.members).toHaveLength(2);

      const engineDef = vehiclePkg.members[0] as DefinitionNode;
      expect(engineDef.name).toBe('Engine');
      expect(engineDef.kind).toBe(SysMLElementKind.PartDefinition);
      expect(engineDef.ownedFeatures).toHaveLength(2);

      const displacement = engineDef.ownedFeatures[0] as UsageNode;
      expect(displacement.name).toBe('displacement');
      expect(displacement.typings).toEqual(['Real']);

      const fuelIn = engineDef.ownedFeatures[1] as UsageNode;
      expect(fuelIn.name).toBe('fuelIn');
      expect(fuelIn.typings).toEqual(['FuelPort']);

      const carDef = vehiclePkg.members[1] as DefinitionNode;
      expect(carDef.name).toBe('Car');
      expect(carDef.specializations).toEqual(['Vehicle']);
      expect(carDef.ownedFeatures).toHaveLength(1);

      const engineUsage = carDef.ownedFeatures[0] as UsageNode;
      expect(engineUsage.name).toBe('engine');
      expect(engineUsage.typings).toEqual(['Engine']);
    });
  });

  describe('visibility', () => {
    it('parses public visibility', () => {
      const { ast, diagnostics } = parse('public part def Visible { }');
      expect(diagnostics).toHaveLength(0);
      const def = (ast as PackageNode).members[0];
      expect(def.visibility).toBe('public');
    });

    it('parses private visibility', () => {
      const { ast, diagnostics } = parse('private part def Hidden { }');
      expect(diagnostics).toHaveLength(0);
      const def = (ast as PackageNode).members[0];
      expect(def.visibility).toBe('private');
    });
  });

  describe('error recovery', () => {
    it('recovers from missing semicolons', () => {
      const { ast, diagnostics } = parse('part x : A\npart y : B;');
      // Should still parse both members, with a diagnostic for the missing semicolon
      expect(diagnostics.length).toBeGreaterThan(0);
      const members = (ast as PackageNode).members;
      expect(members.length).toBeGreaterThanOrEqual(1);
    });

    it('handles empty files', () => {
      const { ast, diagnostics } = parse('');
      expect(diagnostics).toHaveLength(0);
      expect(ast).toBeDefined();
    });

    it('handles files with only comments', () => {
      const { ast, diagnostics } = parse('// just a comment\n/* block */');
      expect(diagnostics).toHaveLength(0);
      expect(ast).toBeDefined();
    });

    it('produces diagnostics for invalid syntax', () => {
      const { diagnostics } = parse('$$$ invalid');
      expect(diagnostics.length).toBeGreaterThan(0);
    });
  });
});
