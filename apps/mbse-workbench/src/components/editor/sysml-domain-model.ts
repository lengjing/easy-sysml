/**
 * SysML Domain Model
 *
 * Converts LSP DocumentSymbol[] (already parsed by the language server)
 * into a domain model used by the model view. No redundant parsing.
 */
import { SymbolKind, type DocumentSymbol } from 'vscode-languageserver-protocol';

/* ------------------------------------------------------------------ */
/*  Domain types                                                      */
/* ------------------------------------------------------------------ */

/** Categorisation of SysML element kinds for display. */
export type SysMLCategory =
  | 'package'
  | 'definition'
  | 'usage'
  | 'requirement'
  | 'constraint'
  | 'behavior'
  | 'relationship'
  | 'other';

/** A domain element derived from an LSP DocumentSymbol. */
export interface DomainElement {
  /** Stable id (qualified path, e.g. "UAV_System::Control_Subsystem"). */
  id: string;
  /** Display name. */
  name: string;
  /** Original LSP detail (usually the SysML keyword, e.g. "part def"). */
  detail: string;
  /** Mapped SysML element kind label. */
  kind: string;
  /** High-level category for grouping in the model tree. */
  category: SysMLCategory;
  /** LSP symbol kind (kept for icon mapping). */
  symbolKind: SymbolKind;
  /** Children domain elements. */
  children: DomainElement[];
  /** Source range in the document (1-based lines/columns, matching LSP). */
  range: {
    startLine: number;
    startColumn: number;
    endLine: number;
    endColumn: number;
  };
  /** Selection range (for the name token). */
  selectionRange: {
    startLine: number;
    startColumn: number;
    endLine: number;
    endColumn: number;
  };
}

/** The full domain model built from LSP results. */
export interface DomainModel {
  elements: DomainElement[];
}

/* ------------------------------------------------------------------ */
/*  SysML element kind mapping                                        */
/* ------------------------------------------------------------------ */

/**
 * Map an LSP DocumentSymbol to a SysML kind label and category.
 *
 * Priority order:
 *  1. Exact match on `detail` against the AST $type set by
 *     SysMLDocumentSymbolProvider (e.g. "PartDefinition").
 *  2. Keyword-style matching on `detail` for compatibility with
 *     editors that format the detail as "part def", "requirement", etc.
 *  3. Fallback by LSP SymbolKind.
 */

/** Lookup table: AST $type → { kind, category }. */
const AST_TYPE_MAP: Record<string, { kind: string; category: SysMLCategory }> = {
  // Packages / namespaces
  Package:                     { kind: 'Package', category: 'package' },
  LibraryPackage:              { kind: 'Package', category: 'package' },
  Namespace:                   { kind: 'Namespace', category: 'package' },

  // Definitions
  PartDefinition:              { kind: 'PartDefinition', category: 'definition' },
  AttributeDefinition:         { kind: 'AttributeDefinition', category: 'definition' },
  PortDefinition:              { kind: 'PortDefinition', category: 'definition' },
  InterfaceDefinition:         { kind: 'InterfaceDefinition', category: 'definition' },
  ConnectionDefinition:        { kind: 'ConnectionDefinition', category: 'definition' },
  AllocationDefinition:        { kind: 'AllocationDefinition', category: 'definition' },
  FlowConnectionDefinition:    { kind: 'FlowConnectionDefinition', category: 'definition' },
  ItemDefinition:              { kind: 'ItemDefinition', category: 'definition' },
  OccurrenceDefinition:        { kind: 'OccurrenceDefinition', category: 'definition' },
  EnumerationDefinition:       { kind: 'EnumerationDefinition', category: 'definition' },
  MetadataDefinition:          { kind: 'MetadataDefinition', category: 'definition' },
  ViewDefinition:              { kind: 'ViewDefinition', category: 'definition' },
  ViewpointDefinition:         { kind: 'ViewpointDefinition', category: 'definition' },
  RenderingDefinition:         { kind: 'RenderingDefinition', category: 'definition' },
  ActionDefinition:            { kind: 'ActionDefinition', category: 'behavior' },
  StateDefinition:             { kind: 'StateDefinition', category: 'behavior' },
  CalculationDefinition:       { kind: 'CalculationDefinition', category: 'behavior' },
  ConstraintDefinition:        { kind: 'ConstraintDefinition', category: 'constraint' },
  RequirementDefinition:       { kind: 'RequirementDefinition', category: 'requirement' },
  ConcernDefinition:           { kind: 'ConcernDefinition', category: 'requirement' },
  CaseDefinition:              { kind: 'CaseDefinition', category: 'behavior' },
  AnalysisCaseDefinition:      { kind: 'AnalysisCaseDefinition', category: 'behavior' },
  VerificationCaseDefinition:  { kind: 'VerificationCaseDefinition', category: 'behavior' },
  UseCaseDefinition:           { kind: 'UseCaseDefinition', category: 'behavior' },

  // Usages
  PartUsage:                   { kind: 'PartUsage', category: 'usage' },
  AttributeUsage:              { kind: 'AttributeUsage', category: 'usage' },
  PortUsage:                   { kind: 'PortUsage', category: 'usage' },
  InterfaceUsage:              { kind: 'InterfaceUsage', category: 'usage' },
  ConnectionUsage:             { kind: 'ConnectionUsage', category: 'usage' },
  AllocationUsage:             { kind: 'AllocationUsage', category: 'usage' },
  ItemUsage:                   { kind: 'ItemUsage', category: 'usage' },
  OccurrenceUsage:             { kind: 'OccurrenceUsage', category: 'usage' },
  EnumerationUsage:            { kind: 'EnumerationUsage', category: 'usage' },
  ReferenceUsage:              { kind: 'ReferenceUsage', category: 'usage' },
  MetadataUsage:               { kind: 'MetadataUsage', category: 'usage' },
  FlowUsage:                   { kind: 'FlowConnectionUsage', category: 'usage' },
  SuccessionFlowUsage:         { kind: 'FlowConnectionUsage', category: 'usage' },
  ViewUsage:                   { kind: 'ViewUsage', category: 'usage' },
  ViewpointUsage:              { kind: 'ViewpointUsage', category: 'usage' },
  RenderingUsage:              { kind: 'RenderingUsage', category: 'usage' },

  // Behavioral usages
  ActionUsage:                 { kind: 'ActionUsage', category: 'behavior' },
  StateUsage:                  { kind: 'StateUsage', category: 'behavior' },
  CalculationUsage:            { kind: 'CalculationUsage', category: 'behavior' },
  ConstraintUsage:             { kind: 'ConstraintUsage', category: 'constraint' },
  RequirementUsage:            { kind: 'RequirementUsage', category: 'requirement' },
  ConcernUsage:                { kind: 'ConcernUsage', category: 'requirement' },
  CaseUsage:                   { kind: 'CaseUsage', category: 'behavior' },
  AnalysisCaseUsage:           { kind: 'AnalysisCaseUsage', category: 'behavior' },
  VerificationCaseUsage:       { kind: 'VerificationCaseUsage', category: 'behavior' },
  UseCaseUsage:                { kind: 'UseCaseUsage', category: 'behavior' },
  ExhibitStateUsage:           { kind: 'ExhibitStateUsage', category: 'behavior' },
  PerformActionUsage:          { kind: 'PerformActionUsage', category: 'behavior' },
  AcceptActionUsage:           { kind: 'AcceptActionUsage', category: 'behavior' },
  SendActionUsage:             { kind: 'SendActionUsage', category: 'behavior' },
  AssignmentActionUsage:       { kind: 'AssignmentActionUsage', category: 'behavior' },
  IfActionUsage:               { kind: 'IfActionUsage', category: 'behavior' },
  WhileLoopActionUsage:        { kind: 'WhileLoopActionUsage', category: 'behavior' },
  ForLoopActionUsage:          { kind: 'ForLoopActionUsage', category: 'behavior' },
  TransitionUsage:             { kind: 'TransitionUsage', category: 'behavior' },
  SatisfyRequirementUsage:     { kind: 'SatisfyRequirementUsage', category: 'relationship' },
  AssertConstraintUsage:       { kind: 'AssertConstraintUsage', category: 'constraint' },
  TerminateActionUsage:        { kind: 'TerminateActionUsage', category: 'behavior' },
  IncludeUseCaseUsage:         { kind: 'IncludeUseCaseUsage', category: 'behavior' },
  EventOccurrenceUsage:        { kind: 'EventOccurrenceUsage', category: 'behavior' },

  // Relationships
  BindingConnector:            { kind: 'BindingConnector', category: 'relationship' },
  BindingConnectorAsUsage:     { kind: 'BindingConnector', category: 'relationship' },
  Succession:                  { kind: 'Succession', category: 'relationship' },
  SuccessionAsUsage:           { kind: 'Succession', category: 'relationship' },
};

function classifySymbol(sym: DocumentSymbol): { kind: string; category: SysMLCategory } {
  const detail = (sym.detail ?? '').trim();

  // 1. Exact match against AST $type (PascalCase from the language server)
  if (detail && AST_TYPE_MAP[detail]) {
    return AST_TYPE_MAP[detail];
  }

  // 2. Keyword-style matching (for compatibility / manual detail strings)
  const lc = detail.toLowerCase();

  // Package
  if (lc === 'package' || lc === 'library package') {
    return { kind: 'Package', category: 'package' };
  }

  // Definitions — compound keywords checked first (longest match first)
  if (lc.includes('flow connection def')) return { kind: 'FlowConnectionDefinition', category: 'definition' };
  if (lc.includes('verification case def')) return { kind: 'VerificationCaseDefinition', category: 'behavior' };
  if (lc.includes('analysis case def')) return { kind: 'AnalysisCaseDefinition', category: 'behavior' };
  if (lc.includes('use case def'))    return { kind: 'UseCaseDefinition', category: 'behavior' };
  if (lc.includes('viewpoint def'))   return { kind: 'ViewpointDefinition', category: 'definition' };
  if (lc.includes('rendering def'))   return { kind: 'RenderingDefinition', category: 'definition' };
  if (lc.includes('metadata def'))    return { kind: 'MetadataDefinition', category: 'definition' };
  if (lc.includes('occurrence def'))  return { kind: 'OccurrenceDefinition', category: 'definition' };
  if (lc.includes('part def'))        return { kind: 'PartDefinition', category: 'definition' };
  if (lc.includes('attribute def'))   return { kind: 'AttributeDefinition', category: 'definition' };
  if (lc.includes('port def'))        return { kind: 'PortDefinition', category: 'definition' };
  if (lc.includes('interface def'))   return { kind: 'InterfaceDefinition', category: 'definition' };
  if (lc.includes('connection def'))  return { kind: 'ConnectionDefinition', category: 'definition' };
  if (lc.includes('allocation def'))  return { kind: 'AllocationDefinition', category: 'definition' };
  if (lc.includes('action def'))      return { kind: 'ActionDefinition', category: 'behavior' };
  if (lc.includes('state def'))       return { kind: 'StateDefinition', category: 'behavior' };
  if (lc.includes('calculation def')) return { kind: 'CalculationDefinition', category: 'behavior' };
  if (lc.includes('constraint def'))  return { kind: 'ConstraintDefinition', category: 'constraint' };
  if (lc.includes('requirement def')) return { kind: 'RequirementDefinition', category: 'requirement' };
  if (lc.includes('concern def'))     return { kind: 'ConcernDefinition', category: 'requirement' };
  if (lc.includes('case def'))        return { kind: 'CaseDefinition', category: 'behavior' };
  if (lc.includes('view def'))        return { kind: 'ViewDefinition', category: 'definition' };
  if (lc.includes('item def'))        return { kind: 'ItemDefinition', category: 'definition' };
  if (lc.includes('enum def'))        return { kind: 'EnumerationDefinition', category: 'definition' };

  // Usages — compound keywords first to prevent premature matches
  if (lc.includes('exhibit'))         return { kind: 'ExhibitStateUsage', category: 'behavior' };
  if (lc.includes('perform'))         return { kind: 'PerformActionUsage', category: 'behavior' };
  if (lc.includes('satisfy'))         return { kind: 'SatisfyRequirementUsage', category: 'relationship' };
  if (lc.includes('assert'))          return { kind: 'AssertConstraintUsage', category: 'constraint' };
  if (lc.includes('send'))            return { kind: 'SendActionUsage', category: 'behavior' };
  if (lc.includes('accept'))          return { kind: 'AcceptActionUsage', category: 'behavior' };
  if (lc.includes('assign'))          return { kind: 'AssignmentActionUsage', category: 'behavior' };
  if (lc.includes('transition'))      return { kind: 'TransitionUsage', category: 'behavior' };
  if (lc.includes('succession'))      return { kind: 'Succession', category: 'relationship' };
  if (lc.includes('bind'))            return { kind: 'BindingConnector', category: 'relationship' };
  if (lc.includes('flow'))            return { kind: 'FlowConnectionUsage', category: 'usage' };
  if (lc.includes('while'))           return { kind: 'WhileLoopActionUsage', category: 'behavior' };
  if (lc.includes('for'))             return { kind: 'ForLoopActionUsage', category: 'behavior' };
  if (lc.includes('if'))              return { kind: 'IfActionUsage', category: 'behavior' };
  if (lc.includes('part'))            return { kind: 'PartUsage', category: 'usage' };
  if (lc.includes('attribute'))       return { kind: 'AttributeUsage', category: 'usage' };
  if (lc.includes('port'))            return { kind: 'PortUsage', category: 'usage' };
  if (lc.includes('interface'))       return { kind: 'InterfaceUsage', category: 'usage' };
  if (lc.includes('connection'))      return { kind: 'ConnectionUsage', category: 'usage' };
  if (lc.includes('allocation'))      return { kind: 'AllocationUsage', category: 'usage' };
  if (lc.includes('action'))          return { kind: 'ActionUsage', category: 'behavior' };
  if (lc.includes('state'))           return { kind: 'StateUsage', category: 'behavior' };
  if (lc.includes('calculation'))     return { kind: 'CalculationUsage', category: 'behavior' };
  if (lc.includes('constraint'))      return { kind: 'ConstraintUsage', category: 'constraint' };
  if (lc.includes('requirement'))     return { kind: 'RequirementUsage', category: 'requirement' };
  if (lc.includes('concern'))         return { kind: 'ConcernUsage', category: 'requirement' };
  if (lc.includes('item'))            return { kind: 'ItemUsage', category: 'usage' };
  if (lc.includes('ref'))             return { kind: 'ReferenceUsage', category: 'usage' };
  if (lc.includes('enum'))            return { kind: 'EnumerationUsage', category: 'usage' };

  // 3. Fallback by SymbolKind
  switch (sym.kind) {
    case SymbolKind.Package:   return { kind: 'Package', category: 'package' };
    case SymbolKind.Class:     return { kind: 'Definition', category: 'definition' };
    case SymbolKind.Method:    return { kind: 'Action', category: 'behavior' };
    case SymbolKind.Property:
    case SymbolKind.Field:     return { kind: 'Attribute', category: 'usage' };
    case SymbolKind.Function:  return { kind: 'Calculation', category: 'behavior' };
    case SymbolKind.Variable:  return { kind: 'Usage', category: 'usage' };
    case SymbolKind.Module:    return { kind: 'Namespace', category: 'package' };
    case SymbolKind.Namespace: return { kind: 'Namespace', category: 'package' };
    default:                   return { kind: sym.detail || 'Element', category: 'other' };
  }
}

/* ------------------------------------------------------------------ */
/*  Conversion                                                        */
/* ------------------------------------------------------------------ */

function convertSymbol(sym: DocumentSymbol, parentPath: string[]): DomainElement {
  const { kind, category } = classifySymbol(sym);
  const path = [...parentPath, sym.name];
  const id = path.join('::');

  const children = (sym.children ?? []).map(c => convertSymbol(c, path));

  return {
    id,
    name: sym.name,
    detail: sym.detail ?? '',
    kind,
    category,
    symbolKind: sym.kind,
    children,
    range: {
      startLine: sym.range.start.line + 1,
      startColumn: sym.range.start.character + 1,
      endLine: sym.range.end.line + 1,
      endColumn: sym.range.end.character + 1,
    },
    selectionRange: {
      startLine: sym.selectionRange.start.line + 1,
      startColumn: sym.selectionRange.start.character + 1,
      endLine: sym.selectionRange.end.line + 1,
      endColumn: sym.selectionRange.end.character + 1,
    },
  };
}

/**
 * Convert LSP DocumentSymbol[] (from the editor's language server)
 * into a DomainModel for the model view. No re-parsing required.
 */
export function documentSymbolsToDomainModel(symbols: DocumentSymbol[]): DomainModel {
  const elements = symbols.map(s => convertSymbol(s, []));
  return { elements };
}

/**
 * Flatten a domain model tree into a list for iteration.
 */
export function flattenElements(elements: DomainElement[]): DomainElement[] {
  const result: DomainElement[] = [];
  function walk(els: DomainElement[]) {
    for (const el of els) {
      result.push(el);
      walk(el.children);
    }
  }
  walk(elements);
  return result;
}

/**
 * Find a domain element by id in the tree.
 */
export function findElementById(
  elements: DomainElement[],
  id: string,
): DomainElement | undefined {
  for (const el of elements) {
    if (el.id === id) return el;
    const found = findElementById(el.children, id);
    if (found) return found;
  }
  return undefined;
}
