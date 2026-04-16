import type { UUID } from './sysml-types.js';
import { DiagnosticSeverity } from './sysml-types.js';

/** LSP document URI */
export type DocumentUri = string;

/** Position in a text document */
export interface Position {
  line: number;
  character: number;
}

/** Range in a text document */
export interface Range {
  start: Position;
  end: Position;
}

/** Location in a document */
export interface Location {
  uri: DocumentUri;
  range: Range;
}

/** Diagnostic information */
export interface Diagnostic {
  range: Range;
  severity: DiagnosticSeverity;
  code?: string;
  source?: string;
  message: string;
  relatedInformation?: DiagnosticRelatedInformation[];
}

export interface DiagnosticRelatedInformation {
  location: Location;
  message: string;
}

/** Completion item kind for SysML elements */
export enum CompletionItemKind {
  KEYWORD = 1,
  PACKAGE = 2,
  DEFINITION = 3,
  USAGE = 4,
  RELATIONSHIP = 5,
  SNIPPET = 6,
}

/** Completion item */
export interface CompletionItem {
  label: string;
  kind: CompletionItemKind;
  detail?: string;
  documentation?: string;
  insertText?: string;
  sortText?: string;
}

/** Symbol information for document outline */
export enum SymbolKind {
  PACKAGE = 1,
  DEFINITION = 2,
  USAGE = 3,
  RELATIONSHIP = 4,
  COMMENT = 5,
}

/** Symbol in a document */
export interface DocumentSymbol {
  name: string;
  kind: SymbolKind;
  range: Range;
  selectionRange: Range;
  children?: DocumentSymbol[];
}

/** Hover information */
export interface HoverInfo {
  contents: string;
  range?: Range;
}
