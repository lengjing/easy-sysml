import { describe, it, expect, afterAll } from 'vitest';
import { parseSysML, parseKerML, disposeParser } from '../src/parser.js';

afterAll(() => {
  disposeParser();
});

describe('parseSysML', () => {
  it('parses a simple package', () => {
    const result = parseSysML(`
      package Vehicle {
      }
    `);
    expect(result.success).toBe(true);
    expect(result.parserErrors).toHaveLength(0);
    expect(result.lexerErrors).toHaveLength(0);
    expect(result.ast).toBeDefined();
  });

  it('parses a package with part definition', () => {
    const result = parseSysML(`
      package VehicleModel {
        part def Vehicle {
          part engine : Engine;
        }
        part def Engine;
      }
    `);
    expect(result.success).toBe(true);
    expect(result.parserErrors).toHaveLength(0);
  });

  it('parses attribute definitions', () => {
    const result = parseSysML(`
      package Metrics {
        attribute def Mass;
        attribute def Length;
        part def Component {
          attribute mass : Mass;
        }
      }
    `);
    expect(result.success).toBe(true);
  });

  it('parses port definitions', () => {
    const result = parseSysML(`
      package Ports {
        port def FuelPort;
        port def ElectricPort;
        part def Engine {
          port fuelIn : FuelPort;
        }
      }
    `);
    expect(result.success).toBe(true);
  });

  it('parses connection definitions', () => {
    const result = parseSysML(`
      package Connections {
        part def A;
        part def B;
        connection def Link {
          end a : A;
          end b : B;
        }
      }
    `);
    expect(result.success).toBe(true);
  });

  it('parses action definitions', () => {
    const result = parseSysML(`
      package Actions {
        action def Accelerate;
        action def Brake;
      }
    `);
    expect(result.success).toBe(true);
  });

  it('parses requirement definitions', () => {
    const result = parseSysML(`
      package Requirements {
        requirement def MaxSpeed {
          doc /* The vehicle shall have a maximum speed */
        }
      }
    `);
    expect(result.success).toBe(true);
  });

  it('parses imports', () => {
    const result = parseSysML(`
      package A {
        part def X;
      }
      package B {
        import A::*;
      }
    `);
    expect(result.success).toBe(true);
  });

  it('reports errors for invalid syntax', () => {
    const result = parseSysML(`
      package {
        this is invalid sysml
      }
    `);
    expect(result.success).toBe(false);
    expect(result.parserErrors.length).toBeGreaterThan(0);
  });

  it('uses default URI when none specified', () => {
    const result = parseSysML('package Test;');
    expect(result.success).toBe(true);
  });

  it('accepts custom URI', () => {
    const result = parseSysML('package Test;', 'file:///test.sysml');
    expect(result.success).toBe(true);
  });

  it('parses empty input', () => {
    const result = parseSysML('');
    expect(result.success).toBe(true);
  });

  it('parses state definitions', () => {
    const result = parseSysML(`
      package States {
        state def VehicleStates {
          entry; then idle;
          state idle;
          state moving;
        }
      }
    `);
    expect(result.success).toBe(true);
  });

  it('parses enum definitions', () => {
    const result = parseSysML(`
      package Enums {
        enum def Color {
          enum red;
          enum green;
          enum blue;
        }
      }
    `);
    expect(result.success).toBe(true);
  });
});

describe('parseKerML', () => {
  it('parses a simple namespace', () => {
    const result = parseKerML(`
      package Base {
      }
    `);
    expect(result.success).toBe(true);
    expect(result.parserErrors).toHaveLength(0);
  });

  it('parses classifier definitions', () => {
    const result = parseKerML(`
      package Types {
        classifier Vehicle;
        classifier Engine;
      }
    `);
    expect(result.success).toBe(true);
  });
});
