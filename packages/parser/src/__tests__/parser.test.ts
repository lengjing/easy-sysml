import { describe, it, expect, afterAll } from 'vitest';
import { parseSysML, disposeParser } from '../parser.js';

afterAll(() => {
  disposeParser();
});

describe('parseSysML', () => {
  it('parses a simple package', () => {
    const result = parseSysML(`
      package MyPackage {
      }
    `);

    expect(result.success).toBe(true);
    expect(result.parserErrors).toHaveLength(0);
    expect(result.lexerErrors).toHaveLength(0);
    expect(result.ast).toBeDefined();
    expect(result.ast.$type).toBe('Namespace');
  });

  it('parses a part definition', () => {
    const result = parseSysML(`
      package Vehicle {
        part def Car;
      }
    `);

    expect(result.success).toBe(true);
    expect(result.parserErrors).toHaveLength(0);
  });

  it('parses nested parts', () => {
    const result = parseSysML(`
      package System {
        part def Vehicle {
          part engine : Engine;
        }
        part def Engine;
      }
    `);

    expect(result.success).toBe(true);
  });

  it('parses port definitions', () => {
    const result = parseSysML(`
      package Ports {
        port def FuelPort {
          in attribute fuelLevel : Real;
        }
      }
    `);

    // Note: Real is not resolved but parsing should succeed
    expect(result.success).toBe(true);
  });

  it('parses action definitions', () => {
    const result = parseSysML(`
      package Actions {
        action def Drive;
        action driving : Drive;
      }
    `);

    expect(result.success).toBe(true);
  });

  it('parses attribute definitions', () => {
    const result = parseSysML(`
      package Attributes {
        attribute def Color;
        attribute color : Color;
      }
    `);

    expect(result.success).toBe(true);
  });

  it('reports syntax errors', () => {
    const result = parseSysML(`
      package {
    `);

    // Missing package name or closing brace should cause errors
    expect(result.success).toBe(false);
    expect(result.parserErrors.length + result.lexerErrors.length).toBeGreaterThan(0);
  });

  it('parses empty input', () => {
    const result = parseSysML('');

    expect(result.success).toBe(true);
    expect(result.ast).toBeDefined();
  });

  it('parses comment syntax', () => {
    const result = parseSysML(`
      package MyPackage {
        /* This is a block comment */
        // This is a line comment
        comment Comment1 /* A comment body */
      }
    `);

    expect(result.success).toBe(true);
  });

  it('parses state definitions', () => {
    const result = parseSysML(`
      package States {
        state def VehicleState;
      }
    `);

    expect(result.success).toBe(true);
  });

  it('parses requirement definitions', () => {
    const result = parseSysML(`
      package Requirements {
        requirement def SpeedRequirement {
          doc /* The vehicle shall achieve a max speed */
        }
      }
    `);

    expect(result.success).toBe(true);
  });

  it('uses correct default URI with triple-slash', () => {
    const result = parseSysML('package Test;');

    expect(result.success).toBe(true);
    expect(result.document).toBeDefined();
  });

  it('accepts custom URI', () => {
    const result = parseSysML('package Test;', 'memory:///custom.sysml');

    expect(result.success).toBe(true);
    expect(result.document).toBeDefined();
  });

  it('parses imports', () => {
    const result = parseSysML(`
      package MyPackage {
        import ScalarValues::*;
      }
    `);

    expect(result.success).toBe(true);
  });

  it('parses connection definitions', () => {
    const result = parseSysML(`
      package Connections {
        connection def PowerConnection;
      }
    `);

    expect(result.success).toBe(true);
  });

  it('parses interface definitions', () => {
    const result = parseSysML(`
      package Interfaces {
        interface def FuelInterface;
      }
    `);

    expect(result.success).toBe(true);
  });

  it('parses allocation definitions', () => {
    const result = parseSysML(`
      package Allocations {
        allocation def SystemAllocation;
      }
    `);

    expect(result.success).toBe(true);
  });
});
