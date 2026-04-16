/** Token kinds for SysML v2 / KerML lexer */
export enum TokenKind {
  // Keywords
  PACKAGE = 'package',
  IMPORT = 'import',
  PART = 'part',
  DEF = 'def',
  ATTRIBUTE = 'attribute',
  PORT = 'port',
  ACTION = 'action',
  STATE = 'state',
  ITEM = 'item',
  CONNECTION = 'connection',
  INTERFACE = 'interface',
  FLOW = 'flow',
  ALLOCATION = 'allocation',
  CONSTRAINT = 'constraint',
  REQUIREMENT = 'requirement',
  CALC = 'calc',
  CASE = 'case',
  ANALYSIS = 'analysis',
  VERIFICATION = 'verification',
  USE = 'use',
  VIEW = 'view',
  VIEWPOINT = 'viewpoint',
  RENDERING = 'rendering',
  METADATA = 'metadata',
  ABSTRACT = 'abstract',
  IN = 'in',
  OUT = 'out',
  INOUT = 'inout',
  REF = 'ref',
  READONLY = 'readonly',
  REDEFINES = 'redefines',
  SUBSETS = 'subsets',
  SPECIALIZES = 'specializes',
  CONJUGATES = 'conjugates',
  ABOUT = 'about',
  DOC = 'doc',
  COMMENT_KW = 'comment',
  PRIVATE = 'private',
  PROTECTED = 'protected',
  PUBLIC = 'public',
  ALL = 'all',
  SATISFY = 'satisfy',
  REQUIRE = 'require',
  ASSERT = 'assert',
  ASSUME = 'assume',
  ASSIGN = 'assign',
  BIND = 'bind',
  FIRST = 'first',
  THEN = 'then',
  ACCEPT = 'accept',
  SEND = 'send',
  VIA = 'via',
  TO = 'to',
  FROM = 'from',
  PERFORM = 'perform',
  EXHIBIT = 'exhibit',
  EXPOSE = 'expose',
  ENTRY = 'entry',
  EXIT = 'exit',
  DO = 'do',
  IF = 'if',
  ELSE = 'else',
  WHILE = 'while',
  UNTIL = 'until',
  LOOP = 'loop',
  SUCCESSION = 'succession',
  TRANSITION = 'transition',
  VARIANT = 'variant',
  VARIATION = 'variation',
  ENUM = 'enum',
  INDIVIDUAL = 'individual',
  TIMESLICE = 'timeslice',
  SNAPSHOT = 'snapshot',
  FILTER = 'filter',
  RENDER = 'render',
  ALIAS = 'alias',
  DEPENDENCY = 'dependency',
  ORDERED = 'ordered',
  NONUNIQUE = 'nonunique',
  TRUE = 'true',
  FALSE = 'false',
  NULL = 'null',

  // Punctuation
  LBRACE = '{',
  RBRACE = '}',
  LPAREN = '(',
  RPAREN = ')',
  LBRACKET = '[',
  RBRACKET = ']',
  SEMICOLON = ';',
  COLON = ':',
  COLONCOLON = '::',
  DOT = '.',
  DOTDOT = '..',
  COMMA = ',',
  EQUALS = '=',
  HASH = '#',
  AT = '@',
  ARROW = '->',
  FATARROW = '=>',
  STAR = '*',
  PLUS = '+',
  MINUS = '-',
  SLASH = '/',
  PERCENT = '%',
  CARET = '^',
  TILDE = '~',
  AMP = '&',
  PIPE = '|',
  QUESTION = '?',
  BANG = '!',
  LT = '<',
  GT = '>',
  LTE = '<=',
  GTE = '>=',
  EQEQ = '==',
  NEQ = '!=',
  AND = '&&',
  OR = '||',
  COLONGT = ':>',

  // Literals and identifiers
  IDENTIFIER = 'IDENTIFIER',
  INTEGER = 'INTEGER',
  REAL = 'REAL',
  STRING = 'STRING',

  // Special
  COMMENT = 'COMMENT',
  BLOCK_COMMENT = 'BLOCK_COMMENT',
  DOC_COMMENT = 'DOC_COMMENT',
  WHITESPACE = 'WHITESPACE',
  NEWLINE = 'NEWLINE',
  EOF = 'EOF',
  UNKNOWN = 'UNKNOWN',
}

export interface Token {
  kind: TokenKind;
  text: string;
  offset: number;
  line: number;
  column: number;
  length: number;
}

export interface LexerError {
  message: string;
  line: number;
  column: number;
  offset: number;
}

const KEYWORDS: Map<string, TokenKind> = new Map([
  ['package', TokenKind.PACKAGE],
  ['import', TokenKind.IMPORT],
  ['part', TokenKind.PART],
  ['def', TokenKind.DEF],
  ['attribute', TokenKind.ATTRIBUTE],
  ['port', TokenKind.PORT],
  ['action', TokenKind.ACTION],
  ['state', TokenKind.STATE],
  ['item', TokenKind.ITEM],
  ['connection', TokenKind.CONNECTION],
  ['interface', TokenKind.INTERFACE],
  ['flow', TokenKind.FLOW],
  ['allocation', TokenKind.ALLOCATION],
  ['constraint', TokenKind.CONSTRAINT],
  ['requirement', TokenKind.REQUIREMENT],
  ['calc', TokenKind.CALC],
  ['case', TokenKind.CASE],
  ['analysis', TokenKind.ANALYSIS],
  ['verification', TokenKind.VERIFICATION],
  ['use', TokenKind.USE],
  ['view', TokenKind.VIEW],
  ['viewpoint', TokenKind.VIEWPOINT],
  ['rendering', TokenKind.RENDERING],
  ['metadata', TokenKind.METADATA],
  ['abstract', TokenKind.ABSTRACT],
  ['in', TokenKind.IN],
  ['out', TokenKind.OUT],
  ['inout', TokenKind.INOUT],
  ['ref', TokenKind.REF],
  ['readonly', TokenKind.READONLY],
  ['redefines', TokenKind.REDEFINES],
  ['subsets', TokenKind.SUBSETS],
  ['specializes', TokenKind.SPECIALIZES],
  ['conjugates', TokenKind.CONJUGATES],
  ['about', TokenKind.ABOUT],
  ['doc', TokenKind.DOC],
  ['comment', TokenKind.COMMENT_KW],
  ['private', TokenKind.PRIVATE],
  ['protected', TokenKind.PROTECTED],
  ['public', TokenKind.PUBLIC],
  ['all', TokenKind.ALL],
  ['satisfy', TokenKind.SATISFY],
  ['require', TokenKind.REQUIRE],
  ['assert', TokenKind.ASSERT],
  ['assume', TokenKind.ASSUME],
  ['assign', TokenKind.ASSIGN],
  ['bind', TokenKind.BIND],
  ['first', TokenKind.FIRST],
  ['then', TokenKind.THEN],
  ['accept', TokenKind.ACCEPT],
  ['send', TokenKind.SEND],
  ['via', TokenKind.VIA],
  ['to', TokenKind.TO],
  ['from', TokenKind.FROM],
  ['perform', TokenKind.PERFORM],
  ['exhibit', TokenKind.EXHIBIT],
  ['expose', TokenKind.EXPOSE],
  ['entry', TokenKind.ENTRY],
  ['exit', TokenKind.EXIT],
  ['do', TokenKind.DO],
  ['if', TokenKind.IF],
  ['else', TokenKind.ELSE],
  ['while', TokenKind.WHILE],
  ['until', TokenKind.UNTIL],
  ['loop', TokenKind.LOOP],
  ['succession', TokenKind.SUCCESSION],
  ['transition', TokenKind.TRANSITION],
  ['variant', TokenKind.VARIANT],
  ['variation', TokenKind.VARIATION],
  ['enum', TokenKind.ENUM],
  ['individual', TokenKind.INDIVIDUAL],
  ['timeslice', TokenKind.TIMESLICE],
  ['snapshot', TokenKind.SNAPSHOT],
  ['filter', TokenKind.FILTER],
  ['render', TokenKind.RENDER],
  ['alias', TokenKind.ALIAS],
  ['dependency', TokenKind.DEPENDENCY],
  ['ordered', TokenKind.ORDERED],
  ['nonunique', TokenKind.NONUNIQUE],
  ['true', TokenKind.TRUE],
  ['false', TokenKind.FALSE],
  ['null', TokenKind.NULL],
]);

export class Lexer {
  private source: string;
  private pos: number;
  private line: number;
  private column: number;
  private tokens: Token[];
  private errors: LexerError[];

  constructor(source: string) {
    this.source = source;
    this.pos = 0;
    this.line = 1;
    this.column = 1;
    this.tokens = [];
    this.errors = [];
  }

  tokenize(): { tokens: Token[]; errors: LexerError[] } {
    while (this.pos < this.source.length) {
      const ch = this.source[this.pos];

      // Skip whitespace (space, tab, carriage return)
      if (ch === ' ' || ch === '\t' || ch === '\r') {
        this.advance();
        continue;
      }

      // Newlines
      if (ch === '\n') {
        this.advance();
        this.line++;
        this.column = 1;
        continue;
      }

      // Comments and slash
      if (ch === '/') {
        if (this.peek(1) === '/') {
          this.readLineComment();
          continue;
        }
        if (this.peek(1) === '*') {
          this.readBlockComment();
          continue;
        }
        this.addToken(TokenKind.SLASH, '/', 1);
        this.advance();
        continue;
      }

      // Strings
      if (ch === '"') {
        this.readString('"');
        continue;
      }

      // Unrestricted names (single-quoted identifiers)
      if (ch === "'") {
        this.readUnrestrictedName();
        continue;
      }

      // Numbers
      if (this.isDigit(ch)) {
        this.readNumber();
        continue;
      }

      // Identifiers and keywords
      if (this.isIdentStart(ch)) {
        this.readIdentifier();
        continue;
      }

      // Multi-character operators (longest match first)
      if (this.tryMultiCharOp()) {
        continue;
      }

      // Single-character punctuation
      const singleKind = this.singleCharToken(ch);
      if (singleKind !== undefined) {
        this.addToken(singleKind, ch, 1);
        this.advance();
        continue;
      }

      // Unknown character
      this.errors.push({
        message: `Unexpected character: '${ch}'`,
        line: this.line,
        column: this.column,
        offset: this.pos,
      });
      this.addToken(TokenKind.UNKNOWN, ch, 1);
      this.advance();
    }

    // Add EOF token
    this.tokens.push({
      kind: TokenKind.EOF,
      text: '',
      offset: this.pos,
      line: this.line,
      column: this.column,
      length: 0,
    });

    return { tokens: this.tokens, errors: this.errors };
  }

  private advance(): void {
    this.pos++;
    this.column++;
  }

  private peek(offset = 0): string {
    const idx = this.pos + offset;
    return idx < this.source.length ? this.source[idx] : '\0';
  }

  private addToken(kind: TokenKind, text: string, length: number): void {
    this.tokens.push({
      kind,
      text,
      offset: this.pos,
      line: this.line,
      column: this.column,
      length,
    });
  }

  private isDigit(ch: string): boolean {
    return ch >= '0' && ch <= '9';
  }

  private isIdentStart(ch: string): boolean {
    return (ch >= 'a' && ch <= 'z') ||
           (ch >= 'A' && ch <= 'Z') ||
           ch === '_';
  }

  private isIdentPart(ch: string): boolean {
    return this.isIdentStart(ch) || this.isDigit(ch);
  }

  private readLineComment(): void {
    const startPos = this.pos;
    const startLine = this.line;
    const startCol = this.column;
    // Skip //
    this.advance();
    this.advance();
    while (this.pos < this.source.length && this.source[this.pos] !== '\n') {
      this.advance();
    }
    const text = this.source.slice(startPos, this.pos);
    this.tokens.push({
      kind: TokenKind.COMMENT,
      text,
      offset: startPos,
      line: startLine,
      column: startCol,
      length: text.length,
    });
  }

  private readBlockComment(): void {
    const startPos = this.pos;
    const startLine = this.line;
    const startCol = this.column;
    // Check if it's a doc comment: /** ... */
    const isDoc = this.peek(2) === '*' && this.peek(3) !== '/';

    // Skip /*
    this.advance();
    this.advance();

    let depth = 1;
    while (this.pos < this.source.length && depth > 0) {
      if (this.source[this.pos] === '/' && this.peek(1) === '*') {
        depth++;
        this.advance();
        this.advance();
      } else if (this.source[this.pos] === '*' && this.peek(1) === '/') {
        depth--;
        this.advance();
        this.advance();
      } else if (this.source[this.pos] === '\n') {
        this.advance();
        this.line++;
        this.column = 1;
      } else {
        this.advance();
      }
    }

    if (depth > 0) {
      this.errors.push({
        message: 'Unterminated block comment',
        line: startLine,
        column: startCol,
        offset: startPos,
      });
    }

    const text = this.source.slice(startPos, this.pos);
    this.tokens.push({
      kind: isDoc ? TokenKind.DOC_COMMENT : TokenKind.BLOCK_COMMENT,
      text,
      offset: startPos,
      line: startLine,
      column: startCol,
      length: text.length,
    });
  }

  private readString(quote: string): void {
    const startPos = this.pos;
    const startLine = this.line;
    const startCol = this.column;
    this.advance(); // skip opening quote

    while (this.pos < this.source.length) {
      const ch = this.source[this.pos];
      if (ch === '\\') {
        // Escape sequence - skip next char
        this.advance();
        if (this.pos < this.source.length) {
          if (this.source[this.pos] === '\n') {
            this.line++;
            this.column = 0; // will be incremented by advance()
          }
          this.advance();
        }
      } else if (ch === quote) {
        this.advance(); // skip closing quote
        const text = this.source.slice(startPos, this.pos);
        this.tokens.push({
          kind: TokenKind.STRING,
          text,
          offset: startPos,
          line: startLine,
          column: startCol,
          length: text.length,
        });
        return;
      } else if (ch === '\n') {
        // Strings shouldn't span lines without escaping
        break;
      } else {
        this.advance();
      }
    }

    // Unterminated string
    const text = this.source.slice(startPos, this.pos);
    this.errors.push({
      message: 'Unterminated string literal',
      line: startLine,
      column: startCol,
      offset: startPos,
    });
    this.tokens.push({
      kind: TokenKind.STRING,
      text,
      offset: startPos,
      line: startLine,
      column: startCol,
      length: text.length,
    });
  }

  private readUnrestrictedName(): void {
    const startPos = this.pos;
    const startLine = this.line;
    const startCol = this.column;
    this.advance(); // skip opening quote

    while (this.pos < this.source.length) {
      const ch = this.source[this.pos];
      if (ch === '\\') {
        this.advance();
        if (this.pos < this.source.length) {
          this.advance();
        }
      } else if (ch === "'") {
        this.advance(); // skip closing quote
        const text = this.source.slice(startPos, this.pos);
        this.tokens.push({
          kind: TokenKind.IDENTIFIER,
          text,
          offset: startPos,
          line: startLine,
          column: startCol,
          length: text.length,
        });
        return;
      } else if (ch === '\n') {
        break;
      } else {
        this.advance();
      }
    }

    // Unterminated unrestricted name
    const text = this.source.slice(startPos, this.pos);
    this.errors.push({
      message: 'Unterminated unrestricted name',
      line: startLine,
      column: startCol,
      offset: startPos,
    });
    this.tokens.push({
      kind: TokenKind.IDENTIFIER,
      text,
      offset: startPos,
      line: startLine,
      column: startCol,
      length: text.length,
    });
  }

  private readNumber(): void {
    const startPos = this.pos;
    const startLine = this.line;
    const startCol = this.column;
    let isReal = false;

    // Integer part
    while (this.pos < this.source.length && this.isDigit(this.source[this.pos])) {
      this.advance();
    }

    // Decimal part
    if (this.pos < this.source.length && this.source[this.pos] === '.' && this.isDigit(this.peek(1))) {
      isReal = true;
      this.advance(); // skip '.'
      while (this.pos < this.source.length && this.isDigit(this.source[this.pos])) {
        this.advance();
      }
    }

    // Exponent part
    if (this.pos < this.source.length && (this.source[this.pos] === 'e' || this.source[this.pos] === 'E')) {
      isReal = true;
      this.advance(); // skip 'e'/'E'
      if (this.pos < this.source.length && (this.source[this.pos] === '+' || this.source[this.pos] === '-')) {
        this.advance();
      }
      if (this.pos < this.source.length && this.isDigit(this.source[this.pos])) {
        while (this.pos < this.source.length && this.isDigit(this.source[this.pos])) {
          this.advance();
        }
      } else {
        this.errors.push({
          message: 'Invalid number: expected digit after exponent',
          line: startLine,
          column: startCol,
          offset: startPos,
        });
      }
    }

    const text = this.source.slice(startPos, this.pos);
    this.tokens.push({
      kind: isReal ? TokenKind.REAL : TokenKind.INTEGER,
      text,
      offset: startPos,
      line: startLine,
      column: startCol,
      length: text.length,
    });
  }

  private readIdentifier(): void {
    const startPos = this.pos;
    const startLine = this.line;
    const startCol = this.column;

    while (this.pos < this.source.length && this.isIdentPart(this.source[this.pos])) {
      this.advance();
    }

    const text = this.source.slice(startPos, this.pos);
    const keyword = KEYWORDS.get(text);

    this.tokens.push({
      kind: keyword ?? TokenKind.IDENTIFIER,
      text,
      offset: startPos,
      line: startLine,
      column: startCol,
      length: text.length,
    });
  }

  private tryMultiCharOp(): boolean {
    const ch = this.source[this.pos];
    const next = this.peek(1);

    let kind: TokenKind | undefined;
    let text: string;
    let len: number;

    // Two-character operators
    if (ch === ':' && next === ':') {
      kind = TokenKind.COLONCOLON; text = '::'; len = 2;
    } else if (ch === ':' && next === '>') {
      kind = TokenKind.COLONGT; text = ':>'; len = 2;
    } else if (ch === '.' && next === '.') {
      kind = TokenKind.DOTDOT; text = '..'; len = 2;
    } else if (ch === '-' && next === '>') {
      kind = TokenKind.ARROW; text = '->'; len = 2;
    } else if (ch === '=' && next === '>') {
      kind = TokenKind.FATARROW; text = '=>'; len = 2;
    } else if (ch === '<' && next === '=') {
      kind = TokenKind.LTE; text = '<='; len = 2;
    } else if (ch === '>' && next === '=') {
      kind = TokenKind.GTE; text = '>='; len = 2;
    } else if (ch === '=' && next === '=') {
      kind = TokenKind.EQEQ; text = '=='; len = 2;
    } else if (ch === '!' && next === '=') {
      kind = TokenKind.NEQ; text = '!='; len = 2;
    } else if (ch === '&' && next === '&') {
      kind = TokenKind.AND; text = '&&'; len = 2;
    } else if (ch === '|' && next === '|') {
      kind = TokenKind.OR; text = '||'; len = 2;
    } else {
      return false;
    }

    this.addToken(kind, text, len);
    for (let i = 0; i < len; i++) {
      this.advance();
    }
    return true;
  }

  private singleCharToken(ch: string): TokenKind | undefined {
    switch (ch) {
      case '{': return TokenKind.LBRACE;
      case '}': return TokenKind.RBRACE;
      case '(': return TokenKind.LPAREN;
      case ')': return TokenKind.RPAREN;
      case '[': return TokenKind.LBRACKET;
      case ']': return TokenKind.RBRACKET;
      case ';': return TokenKind.SEMICOLON;
      case ':': return TokenKind.COLON;
      case '.': return TokenKind.DOT;
      case ',': return TokenKind.COMMA;
      case '=': return TokenKind.EQUALS;
      case '#': return TokenKind.HASH;
      case '@': return TokenKind.AT;
      case '*': return TokenKind.STAR;
      case '+': return TokenKind.PLUS;
      case '-': return TokenKind.MINUS;
      case '%': return TokenKind.PERCENT;
      case '^': return TokenKind.CARET;
      case '~': return TokenKind.TILDE;
      case '&': return TokenKind.AMP;
      case '|': return TokenKind.PIPE;
      case '?': return TokenKind.QUESTION;
      case '!': return TokenKind.BANG;
      case '<': return TokenKind.LT;
      case '>': return TokenKind.GT;
      default: return undefined;
    }
  }
}
