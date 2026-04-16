/** Token kinds for SysML v2 / KerML lexer */
export declare enum TokenKind {
    PACKAGE = "package",
    IMPORT = "import",
    PART = "part",
    DEF = "def",
    ATTRIBUTE = "attribute",
    PORT = "port",
    ACTION = "action",
    STATE = "state",
    ITEM = "item",
    CONNECTION = "connection",
    INTERFACE = "interface",
    FLOW = "flow",
    ALLOCATION = "allocation",
    CONSTRAINT = "constraint",
    REQUIREMENT = "requirement",
    CALC = "calc",
    CASE = "case",
    ANALYSIS = "analysis",
    VERIFICATION = "verification",
    USE = "use",
    VIEW = "view",
    VIEWPOINT = "viewpoint",
    RENDERING = "rendering",
    METADATA = "metadata",
    ABSTRACT = "abstract",
    IN = "in",
    OUT = "out",
    INOUT = "inout",
    REF = "ref",
    READONLY = "readonly",
    REDEFINES = "redefines",
    SUBSETS = "subsets",
    SPECIALIZES = "specializes",
    CONJUGATES = "conjugates",
    ABOUT = "about",
    DOC = "doc",
    COMMENT_KW = "comment",
    PRIVATE = "private",
    PROTECTED = "protected",
    PUBLIC = "public",
    ALL = "all",
    SATISFY = "satisfy",
    REQUIRE = "require",
    ASSERT = "assert",
    ASSUME = "assume",
    ASSIGN = "assign",
    BIND = "bind",
    FIRST = "first",
    THEN = "then",
    ACCEPT = "accept",
    SEND = "send",
    VIA = "via",
    TO = "to",
    FROM = "from",
    PERFORM = "perform",
    EXHIBIT = "exhibit",
    EXPOSE = "expose",
    ENTRY = "entry",
    EXIT = "exit",
    DO = "do",
    IF = "if",
    ELSE = "else",
    WHILE = "while",
    UNTIL = "until",
    LOOP = "loop",
    SUCCESSION = "succession",
    TRANSITION = "transition",
    VARIANT = "variant",
    VARIATION = "variation",
    ENUM = "enum",
    INDIVIDUAL = "individual",
    TIMESLICE = "timeslice",
    SNAPSHOT = "snapshot",
    FILTER = "filter",
    RENDER = "render",
    ALIAS = "alias",
    DEPENDENCY = "dependency",
    ORDERED = "ordered",
    NONUNIQUE = "nonunique",
    TRUE = "true",
    FALSE = "false",
    NULL = "null",
    LBRACE = "{",
    RBRACE = "}",
    LPAREN = "(",
    RPAREN = ")",
    LBRACKET = "[",
    RBRACKET = "]",
    SEMICOLON = ";",
    COLON = ":",
    COLONCOLON = "::",
    DOT = ".",
    DOTDOT = "..",
    COMMA = ",",
    EQUALS = "=",
    HASH = "#",
    AT = "@",
    ARROW = "->",
    FATARROW = "=>",
    STAR = "*",
    PLUS = "+",
    MINUS = "-",
    SLASH = "/",
    PERCENT = "%",
    CARET = "^",
    TILDE = "~",
    AMP = "&",
    PIPE = "|",
    QUESTION = "?",
    BANG = "!",
    LT = "<",
    GT = ">",
    LTE = "<=",
    GTE = ">=",
    EQEQ = "==",
    NEQ = "!=",
    AND = "&&",
    OR = "||",
    COLONGT = ":>",
    IDENTIFIER = "IDENTIFIER",
    INTEGER = "INTEGER",
    REAL = "REAL",
    STRING = "STRING",
    COMMENT = "COMMENT",
    BLOCK_COMMENT = "BLOCK_COMMENT",
    DOC_COMMENT = "DOC_COMMENT",
    WHITESPACE = "WHITESPACE",
    NEWLINE = "NEWLINE",
    EOF = "EOF",
    UNKNOWN = "UNKNOWN"
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
export declare class Lexer {
    private source;
    private pos;
    private line;
    private column;
    private tokens;
    private errors;
    constructor(source: string);
    tokenize(): {
        tokens: Token[];
        errors: LexerError[];
    };
    private advance;
    private peek;
    private addToken;
    private isDigit;
    private isIdentStart;
    private isIdentPart;
    private readLineComment;
    private readBlockComment;
    private readString;
    private readUnrestrictedName;
    private readNumber;
    private readIdentifier;
    private tryMultiCharOp;
    private singleCharToken;
}
//# sourceMappingURL=lexer.d.ts.map