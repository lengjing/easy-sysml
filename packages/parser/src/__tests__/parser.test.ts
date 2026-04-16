import { describe, it, expect, afterAll } from 'vitest';
import { parseSysML, disposeParser } from '../parser.js';
import { isNamespace, isPackage, isRootNamespace } from '../generated/ast.js';
import { bridgeAst } from '../ast-bridge.js';

afterAll(() => {
  disposeParser();
});

describe('parseSysML', () => {
  it('parses an empty document successfully', () => {
    const result = parseSysML('');
    expect(result.success).toBe(true);
    expect(result.parserErrors).toHaveLength(0);
    expect(result.lexerErrors).toHaveLength(0);
    expect(result.ast).toBeDefined();
    expect(isRootNamespace(result.ast)).toBe(true);
  });

  it('parses a simple package declaration', () => {
    const result = parseSysML(`
      package MyPackage {
      }
    `);
    expect(result.success).toBe(true);
    expect(result.parserErrors).toHaveLength(0);
  });

  it('parses a part definition', () => {
    const result = parseSysML(`
      part def Vehicle {
        attribute mass : Real;
      }
    `);
    expect(result.success).toBe(true);
    expect(result.parserErrors).toHaveLength(0);
  });

  it('parses nested packages', () => {
    const result = parseSysML(`
      package Outer {
        package Inner {
        }
      }
    `);
    expect(result.success).toBe(true);
    expect(result.parserErrors).toHaveLength(0);
  });

  it('parses part usages', () => {
    const result = parseSysML(`
      part def Vehicle;
      part myVehicle : Vehicle;
    `);
    expect(result.success).toBe(true);
    expect(result.parserErrors).toHaveLength(0);
  });

  it('parses port definitions', () => {
    const result = parseSysML(`
      port def FuelPort {
        in attribute fuelFlow : Real;
      }
    `);
    expect(result.success).toBe(true);
  });

  it('parses action definitions', () => {
    const result = parseSysML(`
      action def Drive {
        in item vehicle;
      }
    `);
    expect(result.success).toBe(true);
  });

  it('parses requirement definitions', () => {
    const result = parseSysML(`
      requirement def MassReq {
        doc /* The vehicle mass shall not exceed 2000 kg. */
      }
    `);
    expect(result.success).toBe(true);
  });

  it('parses comments', () => {
    const result = parseSysML(`
      /* This is a comment */
      package Pkg {
      }
    `);
    expect(result.success).toBe(true);
  });

  it('reports parse errors for invalid syntax', () => {
    const result = parseSysML(`
      part def {
    `);
    expect(result.success).toBe(false);
    expect(result.parserErrors.length + result.lexerErrors.length).toBeGreaterThan(0);
  });

  it('returns a Langium document', () => {
    const result = parseSysML('package P {}');
    expect(result.document).toBeDefined();
    expect(result.document.uri).toBeDefined();
  });
});

describe('bridgeAst', () => {
  it('bridges a package from the Langium AST', () => {
    const result = parseSysML(`
      package MyPackage {
      }
    `);
    expect(result.success).toBe(true);
    const nodes = bridgeAst(result.ast);
    const pkgNode = nodes.find((n) => n.name === 'MyPackage');
    expect(pkgNode).toBeDefined();
    expect(pkgNode!.kind).toContain('Package');
  });
});
