// ---------------------------------------------------------------------------
// Lightweight LSP protocol type definitions
// ---------------------------------------------------------------------------

/** Zero-based position in a text document. */
export interface Position {
  readonly line: number;
  readonly character: number;
}

/** A contiguous range within a text document. */
export interface Range {
  readonly start: Position;
  readonly end: Position;
}

/** A location inside a resource identified by a URI. */
export interface Location {
  readonly uri: string;
  readonly range: Range;
}

/** Severity level for a diagnostic. */
export const enum DiagnosticSeverity {
  Error = 1,
  Warning = 2,
  Information = 3,
  Hint = 4,
}

/** A diagnostic – a compiler error, warning, or informational message. */
export interface Diagnostic {
  readonly range: Range;
  readonly message: string;
  readonly severity?: DiagnosticSeverity;
  readonly code?: string | number;
  readonly source?: string;
}

// ---------------------------------------------------------------------------
// Text-document identifiers
// ---------------------------------------------------------------------------

/** Identifies a text document by its URI. */
export interface TextDocumentIdentifier {
  readonly uri: string;
}

/** An item representing a full text document snapshot. */
export interface TextDocumentItem {
  readonly uri: string;
  readonly languageId: string;
  readonly version: number;
  readonly text: string;
}

/** A text document identifier that carries a version number. */
export interface VersionedTextDocumentIdentifier extends TextDocumentIdentifier {
  readonly version: number;
}

/** Describes a content change event on a text document. */
export interface TextDocumentContentChangeEvent {
  readonly range?: Range;
  readonly rangeLength?: number;
  readonly text: string;
}

// ---------------------------------------------------------------------------
// Completion
// ---------------------------------------------------------------------------

/** The kind of a completion item. */
export const enum CompletionItemKind {
  Text = 1,
  Method = 2,
  Function = 3,
  Constructor = 4,
  Field = 5,
  Variable = 6,
  Class = 7,
  Interface = 8,
  Module = 9,
  Property = 10,
  Unit = 11,
  Value = 12,
  Enum = 13,
  Keyword = 14,
  Snippet = 15,
  Color = 16,
  File = 17,
  Reference = 18,
  Folder = 19,
  EnumMember = 20,
  Constant = 21,
  Struct = 22,
  Event = 23,
  Operator = 24,
  TypeParameter = 25,
}

/** A completion item offered by the language server. */
export interface CompletionItem {
  readonly label: string;
  readonly kind?: CompletionItemKind;
  readonly detail?: string;
  readonly documentation?: string;
  readonly insertText?: string;
  readonly textEdit?: TextEdit;
  readonly sortText?: string;
  readonly filterText?: string;
}

// ---------------------------------------------------------------------------
// Hover
// ---------------------------------------------------------------------------

/** Hover information for a symbol. */
export interface Hover {
  readonly contents: string | string[];
  readonly range?: Range;
}

// ---------------------------------------------------------------------------
// Symbols
// ---------------------------------------------------------------------------

/** Symbol kinds used in document/workspace symbol responses. */
export const enum SymbolKind {
  File = 1,
  Module = 2,
  Namespace = 3,
  Package = 4,
  Class = 5,
  Method = 6,
  Property = 7,
  Field = 8,
  Constructor = 9,
  Enum = 10,
  Interface = 11,
  Function = 12,
  Variable = 13,
  Constant = 14,
  String = 15,
  Number = 16,
  Boolean = 17,
  Array = 18,
  Object = 19,
  Key = 20,
  Null = 21,
  EnumMember = 22,
  Struct = 23,
  Event = 24,
  Operator = 25,
  TypeParameter = 26,
}

/** Flat symbol information (used by workspace/symbol). */
export interface SymbolInformation {
  readonly name: string;
  readonly kind: SymbolKind;
  readonly location: Location;
  readonly containerName?: string;
}

/** Hierarchical document symbol with optional children. */
export interface DocumentSymbol {
  readonly name: string;
  readonly kind: SymbolKind;
  readonly range: Range;
  readonly selectionRange: Range;
  readonly detail?: string;
  readonly children?: DocumentSymbol[];
}

// ---------------------------------------------------------------------------
// Edits
// ---------------------------------------------------------------------------

/** A single text edit applied to a document. */
export interface TextEdit {
  readonly range: Range;
  readonly newText: string;
}

/** A workspace edit represents changes to many resources. */
export interface WorkspaceEdit {
  readonly changes?: Record<string, TextEdit[]>;
}
