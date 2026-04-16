import { describe, it, expect } from 'vitest';
import { parseSysML } from '../parse-api.js';
import { Lexer, TokenKind } from '../lexer.js';

describe('Lexer', () => {
  it('should tokenize keywords', () => {
    const lexer = new Lexer('package part def attribute');
    const { tokens } = lexer.tokenize();
    expect(tokens[0].kind).toBe(TokenKind.PACKAGE);
    expect(tokens[1].kind).toBe(TokenKind.PART);
    expect(tokens[2].kind).toBe(TokenKind.DEF);
    expect(tokens[3].kind).toBe(TokenKind.ATTRIBUTE);
  });

  it('should tokenize identifiers and numbers', () => {
    const lexer = new Lexer('myPart 42 3.14');
    const { tokens } = lexer.tokenize();
    expect(tokens[0].kind).toBe(TokenKind.IDENTIFIER);
    expect(tokens[0].text).toBe('myPart');
    expect(tokens[1].kind).toBe(TokenKind.INTEGER);
    expect(tokens[2].kind).toBe(TokenKind.REAL);
  });

  it('should tokenize strings', () => {
    const lexer = new Lexer('"hello world"');
    const { tokens } = lexer.tokenize();
    expect(tokens[0].kind).toBe(TokenKind.STRING);
  });

  it('should handle line comments', () => {
    const lexer = new Lexer('part // comment\ndef');
    const { tokens } = lexer.tokenize();
    const nonComment = tokens.filter(t => t.kind !== TokenKind.COMMENT);
    expect(nonComment).toHaveLength(3); // part, def, EOF
  });

  it('should handle block comments', () => {
    const lexer = new Lexer('part /* block */ def');
    const { tokens } = lexer.tokenize();
    const nonComment = tokens.filter(t => t.kind !== TokenKind.BLOCK_COMMENT);
    expect(nonComment).toHaveLength(3); // part, def, EOF
  });

  it('should tokenize multi-char operators', () => {
    const lexer = new Lexer(':: .. -> =>');
    const { tokens } = lexer.tokenize();
    expect(tokens[0].kind).toBe(TokenKind.COLONCOLON);
    expect(tokens[1].kind).toBe(TokenKind.DOTDOT);
    expect(tokens[2].kind).toBe(TokenKind.ARROW);
    expect(tokens[3].kind).toBe(TokenKind.FATARROW);
  });

  it('should track line and column numbers', () => {
    const lexer = new Lexer('a\nb c');
    const { tokens } = lexer.tokenize();
    expect(tokens[0].line).toBe(1);
    expect(tokens[0].column).toBe(1);
    expect(tokens[1].line).toBe(2);
    expect(tokens[1].column).toBe(1);
    expect(tokens[2].line).toBe(2);
    expect(tokens[2].column).toBe(3);
  });

  it('should tokenize comparison operators', () => {
    const lexer = new Lexer('<= >= == !=');
    const { tokens } = lexer.tokenize();
    expect(tokens[0].kind).toBe(TokenKind.LTE);
    expect(tokens[1].kind).toBe(TokenKind.GTE);
    expect(tokens[2].kind).toBe(TokenKind.EQEQ);
    expect(tokens[3].kind).toBe(TokenKind.NEQ);
  });

  it('should tokenize logical operators', () => {
    const lexer = new Lexer('&& ||');
    const { tokens } = lexer.tokenize();
    expect(tokens[0].kind).toBe(TokenKind.AND);
    expect(tokens[1].kind).toBe(TokenKind.OR);
  });

  it('should handle string escape sequences', () => {
    const lexer = new Lexer('"hello\\nworld"');
    const { tokens } = lexer.tokenize();
    expect(tokens[0].kind).toBe(TokenKind.STRING);
    expect(tokens[0].text).toBe('"hello\\nworld"');
  });

  it('should handle unrestricted names', () => {
    const lexer = new Lexer("'name with spaces'");
    const { tokens } = lexer.tokenize();
    expect(tokens[0].kind).toBe(TokenKind.IDENTIFIER);
    expect(tokens[0].text).toBe("'name with spaces'");
  });

  it('should tokenize number with exponent', () => {
    const lexer = new Lexer('1e10 2.5E-3');
    const { tokens } = lexer.tokenize();
    expect(tokens[0].kind).toBe(TokenKind.REAL);
    expect(tokens[0].text).toBe('1e10');
    expect(tokens[1].kind).toBe(TokenKind.REAL);
    expect(tokens[1].text).toBe('2.5E-3');
  });

  it('should tokenize specialization operator :>', () => {
    const lexer = new Lexer(':>');
    const { tokens } = lexer.tokenize();
    expect(tokens[0].kind).toBe(TokenKind.COLONGT);
  });

  it('should tokenize all punctuation', () => {
    const lexer = new Lexer('{ } ( ) [ ] ; : . , = # @ * + - / % ^ ~ & | ? !');
    const { tokens } = lexer.tokenize();
    const kinds = tokens.slice(0, -1).map(t => t.kind); // exclude EOF
    expect(kinds).toEqual([
      TokenKind.LBRACE, TokenKind.RBRACE,
      TokenKind.LPAREN, TokenKind.RPAREN,
      TokenKind.LBRACKET, TokenKind.RBRACKET,
      TokenKind.SEMICOLON, TokenKind.COLON,
      TokenKind.DOT, TokenKind.COMMA,
      TokenKind.EQUALS, TokenKind.HASH,
      TokenKind.AT, TokenKind.STAR,
      TokenKind.PLUS, TokenKind.MINUS,
      TokenKind.SLASH, TokenKind.PERCENT,
      TokenKind.CARET, TokenKind.TILDE,
      TokenKind.AMP, TokenKind.PIPE,
      TokenKind.QUESTION, TokenKind.BANG,
    ]);
  });

  it('should report error for unterminated string', () => {
    const lexer = new Lexer('"unterminated');
    const { errors } = lexer.tokenize();
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].message).toContain('Unterminated string');
  });

  it('should tokenize doc comments', () => {
    const lexer = new Lexer('/** doc comment */');
    const { tokens } = lexer.tokenize();
    expect(tokens[0].kind).toBe(TokenKind.DOC_COMMENT);
  });

  it('should handle empty input', () => {
    const lexer = new Lexer('');
    const { tokens, errors } = lexer.tokenize();
    expect(tokens).toHaveLength(1); // just EOF
    expect(tokens[0].kind).toBe(TokenKind.EOF);
    expect(errors).toHaveLength(0);
  });
});

describe('Parser', () => {
  it('should parse empty package', () => {
    const result = parseSysML('package MyPackage { }');
    expect(result.success).toBe(true);
    expect(result.ast.members.length).toBeGreaterThanOrEqual(1);
    const pkg = result.ast.members[0].memberElement;
    expect(pkg?.$type).toBe('Package');
    expect((pkg as { name?: string }).name).toBe('MyPackage');
  });

  it('should parse part definition', () => {
    const result = parseSysML(`
      package Vehicle {
        part def Engine {
          attribute cylinders : Integer;
        }
      }
    `);
    expect(result.success).toBe(true);
  });

  it('should parse part usage', () => {
    const result = parseSysML(`
      package Vehicle {
        part def Car;
        part myCar : Car;
      }
    `);
    expect(result.success).toBe(true);
  });

  it('should parse specialization', () => {
    const result = parseSysML(`
      package Vehicle {
        part def Vehicle;
        part def Car :> Vehicle;
      }
    `);
    expect(result.success).toBe(true);
    // Find the Car part def
    const pkg = result.ast.members[0].memberElement as unknown as { $type: string; members: Array<{ memberElement?: { $type: string; specializations?: Array<{ general?: string }> } }> };
    const carMember = pkg.members[1];
    const car = carMember.memberElement as { specializations?: Array<{ general?: string }> };
    expect(car?.specializations?.[0]?.general).toBe('Vehicle');
  });

  it('should parse import', () => {
    const result = parseSysML(`
      package MyPkg {
        import Parts::*;
      }
    `);
    expect(result.success).toBe(true);
    const pkg = result.ast.members[0].memberElement as { $type: string; imports?: Array<{ importedNamespace?: string }> };
    // The import is stored in the Package's imports array
    // Since our root wraps the package as a member, check the inner package
  });

  it('should parse port definitions', () => {
    const result = parseSysML(`
      package System {
        port def FuelPort;
        part def Car {
          in port fuelIn : FuelPort;
          out port exhaustOut : FuelPort;
        }
      }
    `);
    expect(result.success).toBe(true);
  });

  it('should parse attribute with value', () => {
    const result = parseSysML(`
      package Vehicle {
        part def Car {
          attribute weight : Real = 1500.0;
          attribute name : String = "Sedan";
        }
      }
    `);
    expect(result.success).toBe(true);
  });

  it('should report errors gracefully', () => {
    const result = parseSysML('package { }');
    // Should report error but still produce some AST
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('should parse multiple packages', () => {
    const result = parseSysML(`
      package A { }
      package B { }
    `);
    expect(result.success).toBe(true);
    expect(result.ast.members.length).toBe(2);
  });

  it('should parse nested packages', () => {
    const result = parseSysML(`
      package Outer {
        package Inner {
          part def Widget;
        }
      }
    `);
    expect(result.success).toBe(true);
  });

  it('should recover from errors', () => {
    const result = parseSysML(`
      package Test {
        part def !!!;
        part def ValidPart;
      }
    `);
    // Should have errors but continue parsing
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('should parse action definitions', () => {
    const result = parseSysML(`
      package Actions {
        action def Drive;
        action def Brake {
          action applyForce;
        }
      }
    `);
    expect(result.success).toBe(true);
  });

  it('should parse state definitions', () => {
    const result = parseSysML(`
      package States {
        state def VehicleState;
      }
    `);
    expect(result.success).toBe(true);
  });

  it('should parse attribute definitions', () => {
    const result = parseSysML(`
      package Types {
        attribute def Mass;
        attribute def Speed {
          attribute value : Real;
        }
      }
    `);
    expect(result.success).toBe(true);
  });

  it('should parse abstract part definitions', () => {
    const result = parseSysML(`
      package System {
        abstract part def Base;
        part def Concrete :> Base;
      }
    `);
    expect(result.success).toBe(true);
    const sys = result.ast.members[0].memberElement as unknown as { $type: string; members: Array<{ memberElement?: { isAbstract?: boolean } }> };
    expect(sys.members[0].memberElement?.isAbstract).toBe(true);
  });

  it('should parse part usage with body', () => {
    const result = parseSysML(`
      package Vehicle {
        part engine : Engine {
          attribute horsepower : Integer;
        }
      }
    `);
    expect(result.success).toBe(true);
  });

  it('should parse multiple specializations', () => {
    const result = parseSysML(`
      package Vehicle {
        part def SportsCar :> Car, Vehicle;
      }
    `);
    expect(result.success).toBe(true);
    const pkg = result.ast.members[0].memberElement as unknown as {
      members: Array<{ memberElement?: { specializations?: Array<{ general?: string }> } }>;
    };
    const sportsCar = pkg.members[0].memberElement;
    expect(sportsCar?.specializations).toHaveLength(2);
    expect(sportsCar?.specializations?.[0]?.general).toBe('Car');
    expect(sportsCar?.specializations?.[1]?.general).toBe('Vehicle');
  });

  it('should parse import with all keyword', () => {
    const result = parseSysML(`
      package MyPkg {
        import all Parts::*;
      }
    `);
    expect(result.success).toBe(true);
  });

  it('should parse semicolon-terminated package', () => {
    const result = parseSysML('package Simple;');
    expect(result.success).toBe(true);
    expect(result.ast.members.length).toBe(1);
  });

  it('should parse boolean literals in expressions', () => {
    const result = parseSysML(`
      package Test {
        part def Config {
          attribute enabled : Boolean = true;
          attribute disabled : Boolean = false;
        }
      }
    `);
    expect(result.success).toBe(true);
  });

  it('should parse requirement definition', () => {
    const result = parseSysML(`
      package Reqs {
        requirement def SafetyReq;
      }
    `);
    expect(result.success).toBe(true);
    const pkg = result.ast.members[0].memberElement as unknown as {
      members: Array<{ memberElement?: { $type: string } }>;
    };
    expect(pkg.members[0].memberElement?.$type).toBe('RequirementDefinition');
  });

  it('should parse constraint definition', () => {
    const result = parseSysML(`
      package Constraints {
        constraint def MaxSpeed;
      }
    `);
    expect(result.success).toBe(true);
  });

  it('should handle URI in parse result', () => {
    const result = parseSysML('package Test;', 'file:///test.sysml');
    expect(result.ast.$document?.uri).toBe('file:///test.sysml');
  });
});
