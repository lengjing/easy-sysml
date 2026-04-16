/** Token kinds for SysML v2 / KerML lexer */
export var TokenKind;
(function (TokenKind) {
    // Keywords
    TokenKind["PACKAGE"] = "package";
    TokenKind["IMPORT"] = "import";
    TokenKind["PART"] = "part";
    TokenKind["DEF"] = "def";
    TokenKind["ATTRIBUTE"] = "attribute";
    TokenKind["PORT"] = "port";
    TokenKind["ACTION"] = "action";
    TokenKind["STATE"] = "state";
    TokenKind["ITEM"] = "item";
    TokenKind["CONNECTION"] = "connection";
    TokenKind["INTERFACE"] = "interface";
    TokenKind["FLOW"] = "flow";
    TokenKind["ALLOCATION"] = "allocation";
    TokenKind["CONSTRAINT"] = "constraint";
    TokenKind["REQUIREMENT"] = "requirement";
    TokenKind["CALC"] = "calc";
    TokenKind["CASE"] = "case";
    TokenKind["ANALYSIS"] = "analysis";
    TokenKind["VERIFICATION"] = "verification";
    TokenKind["USE"] = "use";
    TokenKind["VIEW"] = "view";
    TokenKind["VIEWPOINT"] = "viewpoint";
    TokenKind["RENDERING"] = "rendering";
    TokenKind["METADATA"] = "metadata";
    TokenKind["ABSTRACT"] = "abstract";
    TokenKind["IN"] = "in";
    TokenKind["OUT"] = "out";
    TokenKind["INOUT"] = "inout";
    TokenKind["REF"] = "ref";
    TokenKind["READONLY"] = "readonly";
    TokenKind["REDEFINES"] = "redefines";
    TokenKind["SUBSETS"] = "subsets";
    TokenKind["SPECIALIZES"] = "specializes";
    TokenKind["CONJUGATES"] = "conjugates";
    TokenKind["ABOUT"] = "about";
    TokenKind["DOC"] = "doc";
    TokenKind["COMMENT_KW"] = "comment";
    TokenKind["PRIVATE"] = "private";
    TokenKind["PROTECTED"] = "protected";
    TokenKind["PUBLIC"] = "public";
    TokenKind["ALL"] = "all";
    TokenKind["SATISFY"] = "satisfy";
    TokenKind["REQUIRE"] = "require";
    TokenKind["ASSERT"] = "assert";
    TokenKind["ASSUME"] = "assume";
    TokenKind["ASSIGN"] = "assign";
    TokenKind["BIND"] = "bind";
    TokenKind["FIRST"] = "first";
    TokenKind["THEN"] = "then";
    TokenKind["ACCEPT"] = "accept";
    TokenKind["SEND"] = "send";
    TokenKind["VIA"] = "via";
    TokenKind["TO"] = "to";
    TokenKind["FROM"] = "from";
    TokenKind["PERFORM"] = "perform";
    TokenKind["EXHIBIT"] = "exhibit";
    TokenKind["EXPOSE"] = "expose";
    TokenKind["ENTRY"] = "entry";
    TokenKind["EXIT"] = "exit";
    TokenKind["DO"] = "do";
    TokenKind["IF"] = "if";
    TokenKind["ELSE"] = "else";
    TokenKind["WHILE"] = "while";
    TokenKind["UNTIL"] = "until";
    TokenKind["LOOP"] = "loop";
    TokenKind["SUCCESSION"] = "succession";
    TokenKind["TRANSITION"] = "transition";
    TokenKind["VARIANT"] = "variant";
    TokenKind["VARIATION"] = "variation";
    TokenKind["ENUM"] = "enum";
    TokenKind["INDIVIDUAL"] = "individual";
    TokenKind["TIMESLICE"] = "timeslice";
    TokenKind["SNAPSHOT"] = "snapshot";
    TokenKind["FILTER"] = "filter";
    TokenKind["RENDER"] = "render";
    TokenKind["ALIAS"] = "alias";
    TokenKind["DEPENDENCY"] = "dependency";
    TokenKind["ORDERED"] = "ordered";
    TokenKind["NONUNIQUE"] = "nonunique";
    TokenKind["TRUE"] = "true";
    TokenKind["FALSE"] = "false";
    TokenKind["NULL"] = "null";
    // Punctuation
    TokenKind["LBRACE"] = "{";
    TokenKind["RBRACE"] = "}";
    TokenKind["LPAREN"] = "(";
    TokenKind["RPAREN"] = ")";
    TokenKind["LBRACKET"] = "[";
    TokenKind["RBRACKET"] = "]";
    TokenKind["SEMICOLON"] = ";";
    TokenKind["COLON"] = ":";
    TokenKind["COLONCOLON"] = "::";
    TokenKind["DOT"] = ".";
    TokenKind["DOTDOT"] = "..";
    TokenKind["COMMA"] = ",";
    TokenKind["EQUALS"] = "=";
    TokenKind["HASH"] = "#";
    TokenKind["AT"] = "@";
    TokenKind["ARROW"] = "->";
    TokenKind["FATARROW"] = "=>";
    TokenKind["STAR"] = "*";
    TokenKind["PLUS"] = "+";
    TokenKind["MINUS"] = "-";
    TokenKind["SLASH"] = "/";
    TokenKind["PERCENT"] = "%";
    TokenKind["CARET"] = "^";
    TokenKind["TILDE"] = "~";
    TokenKind["AMP"] = "&";
    TokenKind["PIPE"] = "|";
    TokenKind["QUESTION"] = "?";
    TokenKind["BANG"] = "!";
    TokenKind["LT"] = "<";
    TokenKind["GT"] = ">";
    TokenKind["LTE"] = "<=";
    TokenKind["GTE"] = ">=";
    TokenKind["EQEQ"] = "==";
    TokenKind["NEQ"] = "!=";
    TokenKind["AND"] = "&&";
    TokenKind["OR"] = "||";
    TokenKind["COLONGT"] = ":>";
    // Literals and identifiers
    TokenKind["IDENTIFIER"] = "IDENTIFIER";
    TokenKind["INTEGER"] = "INTEGER";
    TokenKind["REAL"] = "REAL";
    TokenKind["STRING"] = "STRING";
    // Special
    TokenKind["COMMENT"] = "COMMENT";
    TokenKind["BLOCK_COMMENT"] = "BLOCK_COMMENT";
    TokenKind["DOC_COMMENT"] = "DOC_COMMENT";
    TokenKind["WHITESPACE"] = "WHITESPACE";
    TokenKind["NEWLINE"] = "NEWLINE";
    TokenKind["EOF"] = "EOF";
    TokenKind["UNKNOWN"] = "UNKNOWN";
})(TokenKind || (TokenKind = {}));
const KEYWORDS = new Map([
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
    source;
    pos;
    line;
    column;
    tokens;
    errors;
    constructor(source) {
        this.source = source;
        this.pos = 0;
        this.line = 1;
        this.column = 1;
        this.tokens = [];
        this.errors = [];
    }
    tokenize() {
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
    advance() {
        this.pos++;
        this.column++;
    }
    peek(offset = 0) {
        const idx = this.pos + offset;
        return idx < this.source.length ? this.source[idx] : '\0';
    }
    addToken(kind, text, length) {
        this.tokens.push({
            kind,
            text,
            offset: this.pos,
            line: this.line,
            column: this.column,
            length,
        });
    }
    isDigit(ch) {
        return ch >= '0' && ch <= '9';
    }
    isIdentStart(ch) {
        return (ch >= 'a' && ch <= 'z') ||
            (ch >= 'A' && ch <= 'Z') ||
            ch === '_';
    }
    isIdentPart(ch) {
        return this.isIdentStart(ch) || this.isDigit(ch);
    }
    readLineComment() {
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
    readBlockComment() {
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
            }
            else if (this.source[this.pos] === '*' && this.peek(1) === '/') {
                depth--;
                this.advance();
                this.advance();
            }
            else if (this.source[this.pos] === '\n') {
                this.advance();
                this.line++;
                this.column = 1;
            }
            else {
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
    readString(quote) {
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
            }
            else if (ch === quote) {
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
            }
            else if (ch === '\n') {
                // Strings shouldn't span lines without escaping
                break;
            }
            else {
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
    readUnrestrictedName() {
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
            }
            else if (ch === "'") {
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
            }
            else if (ch === '\n') {
                break;
            }
            else {
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
    readNumber() {
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
            }
            else {
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
    readIdentifier() {
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
    tryMultiCharOp() {
        const ch = this.source[this.pos];
        const next = this.peek(1);
        let kind;
        let text;
        let len;
        // Two-character operators
        if (ch === ':' && next === ':') {
            kind = TokenKind.COLONCOLON;
            text = '::';
            len = 2;
        }
        else if (ch === ':' && next === '>') {
            kind = TokenKind.COLONGT;
            text = ':>';
            len = 2;
        }
        else if (ch === '.' && next === '.') {
            kind = TokenKind.DOTDOT;
            text = '..';
            len = 2;
        }
        else if (ch === '-' && next === '>') {
            kind = TokenKind.ARROW;
            text = '->';
            len = 2;
        }
        else if (ch === '=' && next === '>') {
            kind = TokenKind.FATARROW;
            text = '=>';
            len = 2;
        }
        else if (ch === '<' && next === '=') {
            kind = TokenKind.LTE;
            text = '<=';
            len = 2;
        }
        else if (ch === '>' && next === '=') {
            kind = TokenKind.GTE;
            text = '>=';
            len = 2;
        }
        else if (ch === '=' && next === '=') {
            kind = TokenKind.EQEQ;
            text = '==';
            len = 2;
        }
        else if (ch === '!' && next === '=') {
            kind = TokenKind.NEQ;
            text = '!=';
            len = 2;
        }
        else if (ch === '&' && next === '&') {
            kind = TokenKind.AND;
            text = '&&';
            len = 2;
        }
        else if (ch === '|' && next === '|') {
            kind = TokenKind.OR;
            text = '||';
            len = 2;
        }
        else {
            return false;
        }
        this.addToken(kind, text, len);
        for (let i = 0; i < len; i++) {
            this.advance();
        }
        return true;
    }
    singleCharToken(ch) {
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
//# sourceMappingURL=lexer.js.map