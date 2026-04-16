import { describe, it, expect } from 'vitest';
import { Lexer, TokenKind } from '../lexer.js';

const lexer = new Lexer();

describe('Lexer', () => {
  describe('keywords', () => {
    it('tokenizes SysML keywords', () => {
      const tokens = lexer.tokenize('package part def attribute');
      const kinds = tokens.filter(t => t.kind !== TokenKind.Whitespace && t.kind !== TokenKind.EOF).map(t => t.kind);
      expect(kinds).toEqual([TokenKind.Package, TokenKind.Part, TokenKind.Def, TokenKind.Attribute]);
    });

    it('tokenizes all declaration keywords', () => {
      const input = 'action state requirement port connection interface item flow import enum constraint';
      const tokens = lexer.tokenize(input);
      const kinds = tokens.filter(t => t.kind !== TokenKind.Whitespace && t.kind !== TokenKind.EOF).map(t => t.kind);
      expect(kinds).toEqual([
        TokenKind.Action, TokenKind.State, TokenKind.Requirement, TokenKind.Port,
        TokenKind.Connection, TokenKind.Interface, TokenKind.Item, TokenKind.Flow,
        TokenKind.Import, TokenKind.Enum, TokenKind.Constraint,
      ]);
    });

    it('tokenizes modifier keywords', () => {
      const tokens = lexer.tokenize('abstract in out inout ref ordered nonunique');
      const kinds = tokens.filter(t => t.kind !== TokenKind.Whitespace && t.kind !== TokenKind.EOF).map(t => t.kind);
      expect(kinds).toEqual([
        TokenKind.Abstract, TokenKind.In, TokenKind.Out, TokenKind.Inout,
        TokenKind.Ref, TokenKind.Ordered, TokenKind.Nonunique,
      ]);
    });

    it('tokenizes relationship keywords', () => {
      const tokens = lexer.tokenize('specializes subsets redefines conjugates');
      const kinds = tokens.filter(t => t.kind !== TokenKind.Whitespace && t.kind !== TokenKind.EOF).map(t => t.kind);
      expect(kinds).toEqual([TokenKind.Specializes, TokenKind.Subsets, TokenKind.Redefines, TokenKind.Conjugates]);
    });

    it('tokenizes visibility keywords', () => {
      const tokens = lexer.tokenize('public private protected');
      const kinds = tokens.filter(t => t.kind !== TokenKind.Whitespace && t.kind !== TokenKind.EOF).map(t => t.kind);
      expect(kinds).toEqual([TokenKind.Public, TokenKind.Private, TokenKind.Protected]);
    });

    it('tokenizes logic keywords', () => {
      const tokens = lexer.tokenize('not and or xor implies if else true false null');
      const kinds = tokens.filter(t => t.kind !== TokenKind.Whitespace && t.kind !== TokenKind.EOF).map(t => t.kind);
      expect(kinds).toEqual([
        TokenKind.Not, TokenKind.And, TokenKind.Or, TokenKind.Xor,
        TokenKind.Implies, TokenKind.If, TokenKind.Else,
        TokenKind.True, TokenKind.False, TokenKind.Null,
      ]);
    });
  });

  describe('identifiers', () => {
    it('tokenizes simple identifiers', () => {
      const tokens = lexer.tokenize('Vehicle Engine myPart_1');
      const ids = tokens.filter(t => t.kind === TokenKind.Identifier);
      expect(ids.map(t => t.text)).toEqual(['Vehicle', 'Engine', 'myPart_1']);
    });

    it('distinguishes identifiers from keywords', () => {
      const tokens = lexer.tokenize('packageName package');
      const kinds = tokens.filter(t => t.kind !== TokenKind.Whitespace && t.kind !== TokenKind.EOF).map(t => t.kind);
      expect(kinds).toEqual([TokenKind.Identifier, TokenKind.Package]);
    });
  });

  describe('operators', () => {
    it('tokenizes single-char operators', () => {
      const tokens = lexer.tokenize('{ } ; : = < > [ ] ( ) . * + - ~ # @ | &');
      const ops = tokens.filter(t => t.kind !== TokenKind.Whitespace && t.kind !== TokenKind.EOF).map(t => t.kind);
      expect(ops).toEqual([
        TokenKind.LBrace, TokenKind.RBrace, TokenKind.Semicolon, TokenKind.Colon,
        TokenKind.Equals, TokenKind.LAngle, TokenKind.RAngle, TokenKind.LBracket,
        TokenKind.RBracket, TokenKind.LParen, TokenKind.RParen, TokenKind.Dot,
        TokenKind.Star, TokenKind.Plus, TokenKind.Minus, TokenKind.Tilde,
        TokenKind.Hash, TokenKind.At, TokenKind.Pipe, TokenKind.Ampersand,
      ]);
    });

    it('tokenizes multi-char operators', () => {
      const tokens = lexer.tokenize(':: :> :>> ..');
      const ops = tokens.filter(t => t.kind !== TokenKind.Whitespace && t.kind !== TokenKind.EOF).map(t => t.kind);
      expect(ops).toEqual([TokenKind.ColonColon, TokenKind.ColonGt, TokenKind.ColonGtGt, TokenKind.DotDot]);
    });
  });

  describe('literals', () => {
    it('tokenizes integer literals', () => {
      const tokens = lexer.tokenize('0 42 100');
      const nums = tokens.filter(t => t.kind === TokenKind.IntegerLiteral);
      expect(nums.map(t => t.text)).toEqual(['0', '42', '100']);
    });

    it('tokenizes real literals', () => {
      const tokens = lexer.tokenize('3.14 0.5 1e10');
      const nums = tokens.filter(t => t.kind === TokenKind.RealLiteral);
      expect(nums.map(t => t.text)).toEqual(['3.14', '0.5', '1e10']);
    });

    it('tokenizes string literals', () => {
      const tokens = lexer.tokenize('"hello" "world"');
      const strs = tokens.filter(t => t.kind === TokenKind.StringLiteral);
      expect(strs.map(t => t.text)).toEqual(['"hello"', '"world"']);
    });

    it('handles escape sequences in strings', () => {
      const tokens = lexer.tokenize('"hello\\"world"');
      const strs = tokens.filter(t => t.kind === TokenKind.StringLiteral);
      expect(strs).toHaveLength(1);
      expect(strs[0].text).toBe('"hello\\"world"');
    });
  });

  describe('comments', () => {
    it('tokenizes single-line comments', () => {
      const tokens = lexer.tokenize('// this is a comment\npackage');
      const comments = tokens.filter(t => t.kind === TokenKind.LineComment);
      expect(comments).toHaveLength(1);
      expect(comments[0].text).toBe('// this is a comment');
    });

    it('tokenizes multi-line block comments', () => {
      const tokens = lexer.tokenize('/* multi\nline\ncomment */');
      const comments = tokens.filter(t => t.kind === TokenKind.BlockComment);
      expect(comments).toHaveLength(1);
      expect(comments[0].text).toBe('/* multi\nline\ncomment */');
    });

    it('handles nested block comments', () => {
      const tokens = lexer.tokenize('/* outer /* inner */ still outer */');
      const comments = tokens.filter(t => t.kind === TokenKind.BlockComment);
      expect(comments).toHaveLength(1);
    });
  });

  describe('position tracking', () => {
    it('tracks line and column accurately', () => {
      const tokens = lexer.tokenize('ab\ncd');
      const id1 = tokens.find(t => t.text === 'ab')!;
      const id2 = tokens.find(t => t.text === 'cd')!;

      expect(id1.range.start).toEqual({ line: 0, character: 0 });
      expect(id1.range.end).toEqual({ line: 0, character: 2 });
      expect(id2.range.start).toEqual({ line: 1, character: 0 });
      expect(id2.range.end).toEqual({ line: 1, character: 2 });
    });

    it('handles multi-line positioning', () => {
      const tokens = lexer.tokenize('a\n\nb');
      const last = tokens.find(t => t.text === 'b')!;
      expect(last.range.start.line).toBe(2);
    });
  });

  describe('edge cases', () => {
    it('handles empty input', () => {
      const tokens = lexer.tokenize('');
      expect(tokens).toHaveLength(1);
      expect(tokens[0].kind).toBe(TokenKind.EOF);
    });

    it('handles whitespace-only input', () => {
      const tokens = lexer.tokenize('   \n  \t  ');
      const nonTrivia = tokens.filter(t => t.kind !== TokenKind.Whitespace && t.kind !== TokenKind.EOF);
      expect(nonTrivia).toHaveLength(0);
    });

    it('handles comment-only input', () => {
      const tokens = lexer.tokenize('// just a comment');
      const nonTrivia = tokens.filter(t => t.kind !== TokenKind.Whitespace && t.kind !== TokenKind.LineComment && t.kind !== TokenKind.EOF);
      expect(nonTrivia).toHaveLength(0);
    });

    it('produces an EOF token', () => {
      const tokens = lexer.tokenize('x');
      expect(tokens[tokens.length - 1].kind).toBe(TokenKind.EOF);
    });
  });
});
