// ---------------------------------------------------------------------------
// Tokenizer / Lexer for SysML v2
// ---------------------------------------------------------------------------

import type { Range, Position } from '@easy-sysml/protocol';

// ---------------------------------------------------------------------------
// Token kinds
// ---------------------------------------------------------------------------

export enum TokenKind {
  // Keywords – declarations
  Package = 'Package',
  Part = 'Part',
  Def = 'Def',
  Attribute = 'Attribute',
  Action = 'Action',
  State = 'State',
  Requirement = 'Requirement',
  Port = 'Port',
  Connection = 'Connection',
  Interface = 'Interface',
  Item = 'Item',
  Flow = 'Flow',
  Import = 'Import',
  Alias = 'Alias',
  Comment = 'Comment',
  Doc = 'Doc',
  About = 'About',
  Enum = 'Enum',
  Constraint = 'Constraint',
  Metadata = 'Metadata',
  Abstract = 'Abstract',

  // Keywords – direction
  In = 'In',
  Out = 'Out',
  Inout = 'Inout',

  // Keywords – modifiers & relationships
  Ref = 'Ref',
  Ordered = 'Ordered',
  Nonunique = 'Nonunique',
  Redefines = 'Redefines',
  Subsets = 'Subsets',
  Specializes = 'Specializes',
  Conjugates = 'Conjugates',

  // Keywords – visibility
  Public = 'Public',
  Private = 'Private',
  Protected = 'Protected',

  // Keywords – logic / expressions
  Not = 'Not',
  And = 'And',
  Or = 'Or',
  Xor = 'Xor',
  Implies = 'Implies',
  If = 'If',
  Else = 'Else',
  True = 'True',
  False = 'False',
  Null = 'Null',

  // Delimiters & operators
  LBrace = 'LBrace',
  RBrace = 'RBrace',
  Semicolon = 'Semicolon',
  Colon = 'Colon',
  ColonColon = 'ColonColon',
  Equals = 'Equals',
  ColonGt = 'ColonGt',
  ColonGtGt = 'ColonGtGt',
  LAngle = 'LAngle',
  RAngle = 'RAngle',
  LBracket = 'LBracket',
  RBracket = 'RBracket',
  LParen = 'LParen',
  RParen = 'RParen',
  Dot = 'Dot',
  DotDot = 'DotDot',
  Star = 'Star',
  Slash = 'Slash',
  Plus = 'Plus',
  Minus = 'Minus',
  Tilde = 'Tilde',
  Hash = 'Hash',
  At = 'At',
  Pipe = 'Pipe',
  Ampersand = 'Ampersand',
  Comma = 'Comma',
  Arrow = 'Arrow',

  // Literals & identifiers
  Identifier = 'Identifier',
  StringLiteral = 'StringLiteral',
  IntegerLiteral = 'IntegerLiteral',
  RealLiteral = 'RealLiteral',

  // Trivia
  Whitespace = 'Whitespace',
  LineComment = 'LineComment',
  BlockComment = 'BlockComment',

  // Special
  EOF = 'EOF',
  Unknown = 'Unknown',
}

// ---------------------------------------------------------------------------
// Token
// ---------------------------------------------------------------------------

export interface Token {
  readonly kind: TokenKind;
  readonly text: string;
  readonly range: Range;
}

// ---------------------------------------------------------------------------
// Keyword map
// ---------------------------------------------------------------------------

const KEYWORDS: ReadonlyMap<string, TokenKind> = new Map<string, TokenKind>([
  ['package', TokenKind.Package],
  ['part', TokenKind.Part],
  ['def', TokenKind.Def],
  ['attribute', TokenKind.Attribute],
  ['action', TokenKind.Action],
  ['state', TokenKind.State],
  ['requirement', TokenKind.Requirement],
  ['port', TokenKind.Port],
  ['connection', TokenKind.Connection],
  ['interface', TokenKind.Interface],
  ['item', TokenKind.Item],
  ['flow', TokenKind.Flow],
  ['import', TokenKind.Import],
  ['alias', TokenKind.Alias],
  ['comment', TokenKind.Comment],
  ['doc', TokenKind.Doc],
  ['about', TokenKind.About],
  ['enum', TokenKind.Enum],
  ['constraint', TokenKind.Constraint],
  ['metadata', TokenKind.Metadata],
  ['abstract', TokenKind.Abstract],
  ['in', TokenKind.In],
  ['out', TokenKind.Out],
  ['inout', TokenKind.Inout],
  ['ref', TokenKind.Ref],
  ['ordered', TokenKind.Ordered],
  ['nonunique', TokenKind.Nonunique],
  ['redefines', TokenKind.Redefines],
  ['subsets', TokenKind.Subsets],
  ['specializes', TokenKind.Specializes],
  ['conjugates', TokenKind.Conjugates],
  ['public', TokenKind.Public],
  ['private', TokenKind.Private],
  ['protected', TokenKind.Protected],
  ['not', TokenKind.Not],
  ['and', TokenKind.And],
  ['or', TokenKind.Or],
  ['xor', TokenKind.Xor],
  ['implies', TokenKind.Implies],
  ['if', TokenKind.If],
  ['else', TokenKind.Else],
  ['true', TokenKind.True],
  ['false', TokenKind.False],
  ['null', TokenKind.Null],
]);

// ---------------------------------------------------------------------------
// Lexer
// ---------------------------------------------------------------------------

export class Lexer {
  private input = '';
  private pos = 0;
  private line = 0;
  private col = 0;

  /**
   * Tokenize the full input string. Returns all tokens including an EOF
   * sentinel. Whitespace and comment tokens are included so that a
   * round-trip is possible; consumers may filter them out as needed.
   */
  tokenize(input: string): Token[] {
    this.input = input;
    this.pos = 0;
    this.line = 0;
    this.col = 0;

    const tokens: Token[] = [];

    while (this.pos < this.input.length) {
      const token = this.nextToken();
      tokens.push(token);
    }

    tokens.push(this.makeToken(TokenKind.EOF, '', this.position(), this.position()));
    return tokens;
  }

  // -----------------------------------------------------------------------
  // Core dispatcher
  // -----------------------------------------------------------------------

  private nextToken(): Token {
    const ch = this.input[this.pos];

    // Whitespace
    if (ch === ' ' || ch === '\t' || ch === '\r' || ch === '\n') {
      return this.readWhitespace();
    }

    // Comments & slash
    if (ch === '/') {
      const next = this.input[this.pos + 1];
      if (next === '/') return this.readLineComment();
      if (next === '*') return this.readBlockComment();
      return this.readSingleChar(TokenKind.Slash);
    }

    // String literal
    if (ch === '"') return this.readString();

    // Number literal
    if (ch >= '0' && ch <= '9') return this.readNumber();

    // Identifiers & keywords
    if (this.isIdentStart(ch)) return this.readIdentifierOrKeyword();

    // Multi-character operators (order matters)
    return this.readOperator();
  }

  // -----------------------------------------------------------------------
  // Whitespace
  // -----------------------------------------------------------------------

  private readWhitespace(): Token {
    const start = this.position();
    const startPos = this.pos;

    while (this.pos < this.input.length) {
      const ch = this.input[this.pos];
      if (ch !== ' ' && ch !== '\t' && ch !== '\r' && ch !== '\n') break;
      this.advance();
    }

    return this.makeToken(
      TokenKind.Whitespace,
      this.input.slice(startPos, this.pos),
      start,
      this.position(),
    );
  }

  // -----------------------------------------------------------------------
  // Comments
  // -----------------------------------------------------------------------

  private readLineComment(): Token {
    const start = this.position();
    const startPos = this.pos;
    // skip //
    this.advance();
    this.advance();

    while (this.pos < this.input.length && this.input[this.pos] !== '\n') {
      this.advance();
    }

    return this.makeToken(
      TokenKind.LineComment,
      this.input.slice(startPos, this.pos),
      start,
      this.position(),
    );
  }

  private readBlockComment(): Token {
    const start = this.position();
    const startPos = this.pos;

    // skip /*
    this.advance();
    this.advance();

    let depth = 1;
    while (this.pos < this.input.length && depth > 0) {
      if (this.input[this.pos] === '/' && this.input[this.pos + 1] === '*') {
        depth++;
        this.advance();
        this.advance();
      } else if (this.input[this.pos] === '*' && this.input[this.pos + 1] === '/') {
        depth--;
        this.advance();
        this.advance();
      } else {
        this.advance();
      }
    }

    return this.makeToken(
      TokenKind.BlockComment,
      this.input.slice(startPos, this.pos),
      start,
      this.position(),
    );
  }

  // -----------------------------------------------------------------------
  // String literal
  // -----------------------------------------------------------------------

  private readString(): Token {
    const start = this.position();
    const startPos = this.pos;

    // skip opening quote
    this.advance();

    while (this.pos < this.input.length) {
      const ch = this.input[this.pos];
      if (ch === '\\') {
        // skip escaped character
        this.advance();
        if (this.pos < this.input.length) this.advance();
        continue;
      }
      if (ch === '"') {
        this.advance();
        break;
      }
      if (ch === '\n') {
        // unterminated string – stop before newline
        break;
      }
      this.advance();
    }

    return this.makeToken(
      TokenKind.StringLiteral,
      this.input.slice(startPos, this.pos),
      start,
      this.position(),
    );
  }

  // -----------------------------------------------------------------------
  // Number literal
  // -----------------------------------------------------------------------

  private readNumber(): Token {
    const start = this.position();
    const startPos = this.pos;
    let isReal = false;

    while (this.pos < this.input.length) {
      const ch = this.input[this.pos];
      if (ch >= '0' && ch <= '9') {
        this.advance();
      } else if (ch === '.' && !isReal) {
        const next = this.input[this.pos + 1];
        // Distinguish decimal point from range operator (..)
        if (next !== undefined && next >= '0' && next <= '9') {
          isReal = true;
          this.advance();
        } else {
          break;
        }
      } else if (ch === 'e' || ch === 'E') {
        isReal = true;
        this.advance();
        if (this.pos < this.input.length && (this.input[this.pos] === '+' || this.input[this.pos] === '-')) {
          this.advance();
        }
      } else {
        break;
      }
    }

    return this.makeToken(
      isReal ? TokenKind.RealLiteral : TokenKind.IntegerLiteral,
      this.input.slice(startPos, this.pos),
      start,
      this.position(),
    );
  }

  // -----------------------------------------------------------------------
  // Identifier / keyword
  // -----------------------------------------------------------------------

  private readIdentifierOrKeyword(): Token {
    const start = this.position();
    const startPos = this.pos;

    while (this.pos < this.input.length && this.isIdentPart(this.input[this.pos])) {
      this.advance();
    }

    const text = this.input.slice(startPos, this.pos);
    const kind = KEYWORDS.get(text) ?? TokenKind.Identifier;

    return this.makeToken(kind, text, start, this.position());
  }

  // -----------------------------------------------------------------------
  // Operators / punctuation
  // -----------------------------------------------------------------------

  private readOperator(): Token {
    const start = this.position();
    const ch = this.input[this.pos];
    const next = this.input[this.pos + 1];

    // Two-character operators
    if (ch === ':' && next === ':') { this.advance(); this.advance(); return this.makeToken(TokenKind.ColonColon, '::', start, this.position()); }
    if (ch === ':' && next === '>') {
      const next2 = this.input[this.pos + 2];
      if (next2 === '>') { this.advance(); this.advance(); this.advance(); return this.makeToken(TokenKind.ColonGtGt, ':>>', start, this.position()); }
      this.advance(); this.advance(); return this.makeToken(TokenKind.ColonGt, ':>', start, this.position());
    }
    if (ch === '.' && next === '.') { this.advance(); this.advance(); return this.makeToken(TokenKind.DotDot, '..', start, this.position()); }
    if (ch === '-' && next === '>') { this.advance(); this.advance(); return this.makeToken(TokenKind.Arrow, '->', start, this.position()); }

    // Single-character operators
    const singleMap: Record<string, TokenKind> = {
      '{': TokenKind.LBrace,
      '}': TokenKind.RBrace,
      ';': TokenKind.Semicolon,
      ':': TokenKind.Colon,
      '=': TokenKind.Equals,
      '<': TokenKind.LAngle,
      '>': TokenKind.RAngle,
      '[': TokenKind.LBracket,
      ']': TokenKind.RBracket,
      '(': TokenKind.LParen,
      ')': TokenKind.RParen,
      '.': TokenKind.Dot,
      '*': TokenKind.Star,
      '+': TokenKind.Plus,
      '-': TokenKind.Minus,
      '~': TokenKind.Tilde,
      '#': TokenKind.Hash,
      '@': TokenKind.At,
      '|': TokenKind.Pipe,
      '&': TokenKind.Ampersand,
      ',': TokenKind.Comma,
    };

    const kind = singleMap[ch];
    if (kind !== undefined) {
      return this.readSingleChar(kind);
    }

    // Unknown character
    return this.readSingleChar(TokenKind.Unknown);
  }

  // -----------------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------------

  private readSingleChar(kind: TokenKind): Token {
    const start = this.position();
    const text = this.input[this.pos];
    this.advance();
    return this.makeToken(kind, text, start, this.position());
  }

  private advance(): void {
    if (this.pos < this.input.length) {
      if (this.input[this.pos] === '\n') {
        this.line++;
        this.col = 0;
      } else {
        this.col++;
      }
      this.pos++;
    }
  }

  private position(): Position {
    return { line: this.line, character: this.col };
  }

  private makeToken(kind: TokenKind, text: string, start: Position, end: Position): Token {
    return { kind, text, range: { start, end } };
  }

  private isIdentStart(ch: string): boolean {
    return (
      (ch >= 'a' && ch <= 'z') ||
      (ch >= 'A' && ch <= 'Z') ||
      ch === '_'
    );
  }

  private isIdentPart(ch: string): boolean {
    return this.isIdentStart(ch) || (ch >= '0' && ch <= '9');
  }
}
