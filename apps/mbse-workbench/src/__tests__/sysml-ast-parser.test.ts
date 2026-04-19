import { describe, it, expect } from 'vitest';
import { parseSysMLToDomainModel, applyElementRename } from '../editor/sysml-ast-parser';

describe('sysml-ast-parser', () => {
  describe('parseSysMLToDomainModel', () => {
    it('parses a simple package with part definitions', () => {
      const source = `package UAV_System {
    part def Control_Subsystem {
        doc /* Executes complex flight control algorithms. */
        attribute frequency : String;
    }
    part def Power_Subsystem {
        doc /* Provides regulated power to all avionics. */
        attribute voltage : String;
    }
}`;

      const model = parseSysMLToDomainModel(source);

      expect(model.errors).toHaveLength(0);
      expect(model.elements).toHaveLength(1);

      const pkg = model.elements[0];
      expect(pkg.name).toBe('UAV_System');
      expect(pkg.type).toBe('Package');
      expect(pkg.id).toBe('UAV_System');

      expect(pkg.children).toHaveLength(2);
      const ctrl = pkg.children[0];
      expect(ctrl.name).toBe('Control_Subsystem');
      expect(ctrl.type).toBe('PartDefinition');
      expect(ctrl.id).toBe('UAV_System::Control_Subsystem');

      const pwr = pkg.children[1];
      expect(pwr.name).toBe('Power_Subsystem');
      expect(pwr.type).toBe('PartDefinition');
      expect(pwr.id).toBe('UAV_System::Power_Subsystem');
    });

    it('parses empty input without errors', () => {
      const model = parseSysMLToDomainModel('');
      expect(model.errors).toHaveLength(0);
      expect(model.elements).toHaveLength(0);
    });

    it('captures source ranges from CST nodes', () => {
      const source = 'package Foo { part def Bar; }';
      const model = parseSysMLToDomainModel(source);

      expect(model.elements).toHaveLength(1);
      const foo = model.elements[0];
      expect(foo.sourceRange.startOffset).toBe(0);
      expect(foo.sourceRange.endOffset).toBeGreaterThan(0);
    });

    it('reports parser errors for invalid syntax', () => {
      const model = parseSysMLToDomainModel('package {');
      expect(model.errors.length).toBeGreaterThan(0);
    });

    it('extracts attribute usages as properties', () => {
      const source = `part def MyPart {
        attribute speed : String;
        attribute weight : String;
      }`;
      const model = parseSysMLToDomainModel(source);

      expect(model.elements).toHaveLength(1);
      const part = model.elements[0];
      expect(part.properties).toHaveProperty('speed');
      expect(part.properties).toHaveProperty('weight');
    });

    it('handles nested packages', () => {
      const source = `package Outer {
        package Inner {
          part def Thing;
        }
      }`;
      const model = parseSysMLToDomainModel(source);

      expect(model.elements).toHaveLength(1);
      const outer = model.elements[0];
      expect(outer.name).toBe('Outer');
      expect(outer.children).toHaveLength(1);
      const inner = outer.children[0];
      expect(inner.name).toBe('Inner');
      expect(inner.id).toBe('Outer::Inner');
    });

    it('maps various element types correctly', () => {
      const source = `package Types {
        action def DoSomething;
        state def MyState;
        requirement def MyReq;
        port def MyPort;
      }`;
      const model = parseSysMLToDomainModel(source);

      expect(model.errors).toHaveLength(0);
      const pkg = model.elements[0];
      const types = pkg.children.map(c => c.type);
      expect(types).toContain('ActionDefinition');
      expect(types).toContain('StateDefinition');
      expect(types).toContain('RequirementDefinition');
      expect(types).toContain('PortDefinition');
    });
  });

  describe('applyElementRename', () => {
    it('renames an element at the correct source position', () => {
      const source = `package UAV_System {
    part def Control_Subsystem;
    part def Power_Subsystem;
}`;
      const model = parseSysMLToDomainModel(source);
      const result = applyElementRename(
        source,
        'UAV_System::Control_Subsystem',
        'Navigation_Subsystem',
        model,
      );

      expect(result).toContain('Navigation_Subsystem');
      expect(result).toContain('Power_Subsystem');
      expect(result).not.toContain('Control_Subsystem');
    });

    it('returns original source when element not found', () => {
      const source = 'package Test;';
      const model = parseSysMLToDomainModel(source);
      const result = applyElementRename(source, 'nonexistent', 'NewName', model);
      expect(result).toBe(source);
    });

    it('does not affect other elements with similar names', () => {
      const source = `package Root {
    part def Car;
    part def CarPart;
}`;
      const model = parseSysMLToDomainModel(source);
      const result = applyElementRename(source, 'Root::Car', 'Vehicle', model);

      expect(result).toContain('Vehicle');
      expect(result).toContain('CarPart');
    });
  });
});
