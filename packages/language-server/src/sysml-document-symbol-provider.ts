/**
 * SysML Document Symbol Provider
 *
 * Extends Langium's DefaultDocumentSymbolProvider to:
 *  1. Set `detail` to the AST node type (e.g. "PartDefinition") so consumers
 *     can classify elements without a second parse.
 *  2. Map SymbolKind based on the SysML metaclass for better IDE support.
 *  3. Prevent LSP request failures from crashing the server.
 */

import { SymbolKind, type DocumentSymbol, type DocumentSymbolParams, type CancellationToken } from 'vscode-languageserver';
import type { AstNode, CstNode, MaybePromise, LangiumDocument } from 'langium';
import { DefaultDocumentSymbolProvider, type LangiumServices } from 'langium/lsp';

/* ------------------------------------------------------------------ */
/*  AST $type → SymbolKind mapping                                    */
/* ------------------------------------------------------------------ */

const SYMBOL_KIND_MAP: Record<string, SymbolKind> = {
  // Packages / namespaces
  Package:                     SymbolKind.Package,
  LibraryPackage:              SymbolKind.Package,
  Namespace:                   SymbolKind.Namespace,

  // Definitions → Class
  PartDefinition:              SymbolKind.Class,
  AttributeDefinition:         SymbolKind.Class,
  PortDefinition:              SymbolKind.Class,
  InterfaceDefinition:         SymbolKind.Class,
  ConnectionDefinition:        SymbolKind.Class,
  AllocationDefinition:        SymbolKind.Class,
  FlowConnectionDefinition:    SymbolKind.Class,
  ItemDefinition:              SymbolKind.Class,
  OccurrenceDefinition:        SymbolKind.Class,
  EnumerationDefinition:       SymbolKind.Class,
  MetadataDefinition:          SymbolKind.Class,
  ViewDefinition:              SymbolKind.Class,
  ViewpointDefinition:         SymbolKind.Class,
  RenderingDefinition:         SymbolKind.Class,

  // Behavioral definitions
  ActionDefinition:            SymbolKind.Method,
  StateDefinition:             SymbolKind.Method,
  CalculationDefinition:       SymbolKind.Function,
  ConstraintDefinition:        SymbolKind.Class,
  RequirementDefinition:       SymbolKind.Class,
  ConcernDefinition:           SymbolKind.Class,
  CaseDefinition:              SymbolKind.Class,
  AnalysisCaseDefinition:      SymbolKind.Class,
  VerificationCaseDefinition:  SymbolKind.Class,
  UseCaseDefinition:           SymbolKind.Class,

  // Usages → Variable / Property / Method
  PartUsage:                   SymbolKind.Variable,
  AttributeUsage:              SymbolKind.Property,
  PortUsage:                   SymbolKind.Variable,
  InterfaceUsage:              SymbolKind.Variable,
  ConnectionUsage:             SymbolKind.Variable,
  AllocationUsage:             SymbolKind.Variable,
  ItemUsage:                   SymbolKind.Variable,
  OccurrenceUsage:             SymbolKind.Variable,
  EnumerationUsage:            SymbolKind.Variable,
  ReferenceUsage:              SymbolKind.Variable,
  MetadataUsage:               SymbolKind.Variable,

  // Behavioral usages
  ActionUsage:                 SymbolKind.Method,
  StateUsage:                  SymbolKind.Method,
  CalculationUsage:            SymbolKind.Function,
  ConstraintUsage:             SymbolKind.Variable,
  RequirementUsage:            SymbolKind.Variable,
  ConcernUsage:                SymbolKind.Variable,
  CaseUsage:                   SymbolKind.Variable,
  AnalysisCaseUsage:           SymbolKind.Variable,
  VerificationCaseUsage:       SymbolKind.Variable,
  UseCaseUsage:                SymbolKind.Variable,
  ViewUsage:                   SymbolKind.Variable,
  ViewpointUsage:              SymbolKind.Variable,
  RenderingUsage:              SymbolKind.Variable,
  FlowUsage:                   SymbolKind.Variable,
  SuccessionFlowUsage:         SymbolKind.Variable,
  ExhibitStateUsage:           SymbolKind.Method,
  PerformActionUsage:          SymbolKind.Method,
  AcceptActionUsage:           SymbolKind.Method,
  SendActionUsage:             SymbolKind.Method,
  AssignmentActionUsage:       SymbolKind.Method,
  IfActionUsage:               SymbolKind.Method,
  WhileLoopActionUsage:        SymbolKind.Method,
  ForLoopActionUsage:          SymbolKind.Method,
  TransitionUsage:             SymbolKind.Method,
  SatisfyRequirementUsage:     SymbolKind.Variable,
  AssertConstraintUsage:       SymbolKind.Variable,

  // Relationships
  BindingConnector:            SymbolKind.Variable,
  BindingConnectorAsUsage:     SymbolKind.Variable,
  Succession:                  SymbolKind.Variable,
  SuccessionAsUsage:           SymbolKind.Variable,
};

export class SysMLDocumentSymbolProvider extends DefaultDocumentSymbolProvider {
  constructor(services: LangiumServices) {
    super(services);
  }

  override getSymbols(
    document: LangiumDocument,
    params: DocumentSymbolParams,
    cancelToken?: CancellationToken,
  ): MaybePromise<DocumentSymbol[]> {
    try {
      if (!document.parseResult?.value) {
        return [];
      }
      return super.getSymbols(document, params, cancelToken);
    } catch (err) {
      console.error('[SysML] DocumentSymbol error:', err);
      return [];
    }
  }

  /**
   * Override to set `detail` to the AST $type and a more accurate SymbolKind.
   */
  protected override createSymbol(
    document: LangiumDocument,
    astNode: AstNode,
    cstNode: CstNode,
    nameNode: CstNode,
    computedName?: string,
  ): DocumentSymbol {
    const base = super.createSymbol(document, astNode, cstNode, nameNode, computedName);
    const nodeType = astNode.$type;
    base.detail = nodeType;
    const mappedKind = SYMBOL_KIND_MAP[nodeType];
    if (mappedKind !== undefined) {
      base.kind = mappedKind;
    }
    return base;
  }
}
