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
 * Map an LSP DocumentSymbol detail (the SysML keyword) and kind to a
 * human-readable SysML element kind label and category.
 *
 * The LSP detail string is the primary source because the language server
 * sets it to the keyword (e.g. "part def", "requirement def", etc.).
 * The SymbolKind is used as fallback.
 */
function classifySymbol(sym: DocumentSymbol): { kind: string; category: SysMLCategory } {
  const detail = (sym.detail ?? '').toLowerCase().trim();

  // Package
  if (detail === 'package' || detail === 'library package') {
    return { kind: 'Package', category: 'package' };
  }

  // Definitions (types)
  if (detail.includes('part def'))        return { kind: 'PartDefinition', category: 'definition' };
  if (detail.includes('attribute def'))   return { kind: 'AttributeDefinition', category: 'definition' };
  if (detail.includes('port def'))        return { kind: 'PortDefinition', category: 'definition' };
  if (detail.includes('interface def'))   return { kind: 'InterfaceDefinition', category: 'definition' };
  if (detail.includes('flow connection def')) return { kind: 'FlowConnectionDefinition', category: 'definition' };
  if (detail.includes('connection def'))  return { kind: 'ConnectionDefinition', category: 'definition' };
  if (detail.includes('allocation def'))  return { kind: 'AllocationDefinition', category: 'definition' };
  if (detail.includes('action def'))      return { kind: 'ActionDefinition', category: 'behavior' };
  if (detail.includes('state def'))       return { kind: 'StateDefinition', category: 'behavior' };
  if (detail.includes('calculation def')) return { kind: 'CalculationDefinition', category: 'behavior' };
  if (detail.includes('constraint def'))  return { kind: 'ConstraintDefinition', category: 'constraint' };
  if (detail.includes('requirement def')) return { kind: 'RequirementDefinition', category: 'requirement' };
  if (detail.includes('concern def'))     return { kind: 'ConcernDefinition', category: 'requirement' };
  if (detail.includes('analysis case def')) return { kind: 'AnalysisCaseDefinition', category: 'behavior' };
  if (detail.includes('verification case def')) return { kind: 'VerificationCaseDefinition', category: 'behavior' };
  if (detail.includes('use case def'))    return { kind: 'UseCaseDefinition', category: 'behavior' };
  if (detail.includes('case def'))        return { kind: 'CaseDefinition', category: 'behavior' };
  if (detail.includes('view def'))        return { kind: 'ViewDefinition', category: 'definition' };
  if (detail.includes('viewpoint def'))   return { kind: 'ViewpointDefinition', category: 'definition' };
  if (detail.includes('rendering def'))   return { kind: 'RenderingDefinition', category: 'definition' };
  if (detail.includes('metadata def'))    return { kind: 'MetadataDefinition', category: 'definition' };
  if (detail.includes('occurrence def'))  return { kind: 'OccurrenceDefinition', category: 'definition' };
  if (detail.includes('item def'))        return { kind: 'ItemDefinition', category: 'definition' };
  if (detail.includes('enum def'))        return { kind: 'EnumerationDefinition', category: 'definition' };
  // flow connection def already handled above

  // Usages
  if (detail.includes('part'))            return { kind: 'PartUsage', category: 'usage' };
  if (detail.includes('attribute'))       return { kind: 'AttributeUsage', category: 'usage' };
  if (detail.includes('port'))            return { kind: 'PortUsage', category: 'usage' };
  if (detail.includes('interface'))       return { kind: 'InterfaceUsage', category: 'usage' };
  if (detail.includes('connection'))      return { kind: 'ConnectionUsage', category: 'usage' };
  if (detail.includes('allocation'))      return { kind: 'AllocationUsage', category: 'usage' };
  if (detail.includes('action'))          return { kind: 'ActionUsage', category: 'behavior' };
  if (detail.includes('state'))           return { kind: 'StateUsage', category: 'behavior' };
  if (detail.includes('calculation'))     return { kind: 'CalculationUsage', category: 'behavior' };
  if (detail.includes('constraint'))      return { kind: 'ConstraintUsage', category: 'constraint' };
  if (detail.includes('requirement'))     return { kind: 'RequirementUsage', category: 'requirement' };
  if (detail.includes('concern'))         return { kind: 'ConcernUsage', category: 'requirement' };
  if (detail.includes('item'))            return { kind: 'ItemUsage', category: 'usage' };
  if (detail.includes('ref'))             return { kind: 'ReferenceUsage', category: 'usage' };
  if (detail.includes('flow'))            return { kind: 'FlowConnectionUsage', category: 'usage' };
  if (detail.includes('exhibit'))         return { kind: 'ExhibitStateUsage', category: 'behavior' };
  if (detail.includes('perform'))         return { kind: 'PerformActionUsage', category: 'behavior' };
  if (detail.includes('satisfy'))         return { kind: 'SatisfyRequirementUsage', category: 'relationship' };
  if (detail.includes('assert'))          return { kind: 'AssertConstraintUsage', category: 'constraint' };
  if (detail.includes('bind'))            return { kind: 'BindingConnector', category: 'relationship' };
  if (detail.includes('succession'))      return { kind: 'Succession', category: 'relationship' };
  if (detail.includes('transition'))      return { kind: 'TransitionUsage', category: 'behavior' };
  if (detail.includes('send'))            return { kind: 'SendActionUsage', category: 'behavior' };
  if (detail.includes('accept'))          return { kind: 'AcceptActionUsage', category: 'behavior' };
  if (detail.includes('assign'))          return { kind: 'AssignmentActionUsage', category: 'behavior' };
  if (detail.includes('if'))              return { kind: 'IfActionUsage', category: 'behavior' };
  if (detail.includes('for'))             return { kind: 'ForLoopActionUsage', category: 'behavior' };
  if (detail.includes('while'))           return { kind: 'WhileLoopActionUsage', category: 'behavior' };
  if (detail.includes('enum'))            return { kind: 'EnumerationUsage', category: 'usage' };

  // Fallback by SymbolKind
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
