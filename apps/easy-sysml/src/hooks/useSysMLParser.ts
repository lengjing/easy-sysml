/**
 * Hook: useSysMLParser
 *
 * Converts LSP DocumentSymbol[] (pushed from SysMLEditor) into
 * ReactFlow nodes and edges for the model canvas. No redundant parsing.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { type Node, type Edge } from 'reactflow';
import type { DocumentSymbol } from 'vscode-languageserver-protocol';
import {
  documentSymbolsToDomainModel,
  type DomainModel,
  type DomainElement,
} from '../components/editor/sysml-domain-model';

/* ------------------------------------------------------------------ */
/*  SysML kind → display type mapping                                 */
/* ------------------------------------------------------------------ */

function displayType(kind: string): string {
  switch (kind) {
    case 'Package':               return 'Package';
    case 'PartDefinition':        return 'Block';
    case 'PartUsage':             return 'Part';
    case 'AttributeDefinition':   return 'Attribute';
    case 'AttributeUsage':        return 'Attribute';
    case 'PortDefinition':        return 'Port';
    case 'PortUsage':             return 'Port';
    case 'InterfaceDefinition':   return 'Interface';
    case 'InterfaceUsage':        return 'Interface';
    case 'ConnectionDefinition':  return 'Interface';
    case 'ConnectionUsage':       return 'Interface';
    case 'AllocationDefinition':  return 'Allocation';
    case 'AllocationUsage':       return 'Allocation';
    case 'ActionDefinition':      return 'Action';
    case 'ActionUsage':           return 'Action';
    case 'StateDefinition':       return 'State';
    case 'StateUsage':            return 'State';
    case 'CalculationDefinition': return 'Calculation';
    case 'CalculationUsage':      return 'Calculation';
    case 'ConstraintDefinition':  return 'Constraint';
    case 'ConstraintUsage':       return 'Constraint';
    case 'RequirementDefinition': return 'Requirement';
    case 'RequirementUsage':      return 'Requirement';
    case 'ConcernDefinition':     return 'Concern';
    case 'ConcernUsage':          return 'Concern';
    case 'CaseDefinition':        return 'Case';
    case 'UseCaseDefinition':     return 'UseCase';
    case 'AnalysisCaseDefinition': return 'AnalysisCase';
    case 'VerificationCaseDefinition': return 'VerificationCase';
    case 'ItemDefinition':        return 'Item';
    case 'ItemUsage':             return 'Item';
    case 'EnumerationDefinition': return 'Enumeration';
    case 'EnumerationUsage':      return 'Enumeration';
    case 'ViewDefinition':        return 'View';
    case 'ViewpointDefinition':   return 'Viewpoint';
    case 'RenderingDefinition':   return 'Rendering';
    case 'MetadataDefinition':    return 'Metadata';
    case 'OccurrenceDefinition':  return 'Occurrence';
    case 'FlowConnectionDefinition':
    case 'FlowConnectionUsage':   return 'Flow';
    case 'TransitionUsage':       return 'Transition';
    case 'ExhibitStateUsage':     return 'ExhibitState';
    case 'PerformActionUsage':    return 'PerformAction';
    case 'AcceptActionUsage':     return 'Action';
    case 'SendActionUsage':       return 'Send';
    case 'AssignmentActionUsage': return 'Action';
    case 'IfActionUsage':         return 'Action';
    case 'WhileLoopActionUsage':  return 'Action';
    case 'ForLoopActionUsage':    return 'Action';
    case 'TerminateActionUsage':  return 'Action';
    case 'IncludeUseCaseUsage':   return 'UseCase';
    case 'EventOccurrenceUsage':  return 'Occurrence';
    case 'SatisfyRequirementUsage': return 'Satisfy';
    case 'AssertConstraintUsage': return 'Assert';
    case 'BindingConnector':      return 'Binding';
    case 'Succession':            return 'Succession';
    case 'ReferenceUsage':        return 'Reference';
    case 'OccurrenceUsage':       return 'Occurrence';
    case 'MetadataUsage':         return 'Metadata';
    case 'ViewUsage':             return 'View';
    case 'ViewpointUsage':        return 'Viewpoint';
    case 'RenderingUsage':        return 'Rendering';
    case 'CaseUsage':             return 'Case';
    case 'UseCaseUsage':          return 'UseCase';
    case 'AnalysisCaseUsage':     return 'AnalysisCase';
    case 'VerificationCaseUsage': return 'VerificationCase';
    case 'SuccessionFlowUsage':   return 'Flow';
    case 'Namespace':             return 'Namespace';
    default:                      return kind;
  }
}

/* ------------------------------------------------------------------ */
/*  Layout helpers                                                    */
/* ------------------------------------------------------------------ */

/** Attributes go into the property compartment — not as separate nodes. */
function isAttributeKind(kind: string): boolean {
  return kind === 'AttributeUsage' || kind === 'AttributeDefinition';
}

/**
 * Build ReactFlow nodes/edges from a flat walk of the domain tree.
 * Uses depth-based columns, per-depth row counters.
 */
function buildGraph(elements: DomainElement[]) {
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  const depthCounters = new Map<number, number>();

  function walk(els: DomainElement[], depth: number, parentId?: string) {
    for (const el of els) {
      if (isAttributeKind(el.kind)) continue;    // attributes → properties
      const row = depthCounters.get(depth) ?? 0;
      depthCounters.set(depth, row + 1);

      // Collect attribute children as properties dict
      const properties: Record<string, string> = {};
      for (const child of el.children) {
        if (isAttributeKind(child.kind)) {
          properties[child.name] = child.detail || '';
        }
      }

      nodes.push({
        id: el.id,
        type: 'sysml',
        position: { x: 100 + depth * 300, y: 80 + row * 200 },
        data: {
          label: el.name,
          type: displayType(el.kind),
          kind: el.kind,
          detail: el.detail,
          category: el.category,
          properties,
          status: 'Draft',
          childCount: el.children.filter(c => !isAttributeKind(c.kind)).length,
        },
      });

      if (parentId) {
        edges.push({
          id: `e-${parentId}-${el.id}`,
          source: parentId,
          target: el.id,
          type: 'smoothstep',
          animated: true,
          style: { strokeWidth: 1.5 },
        });
      }

      const nonAttr = el.children.filter(c => !isAttributeKind(c.kind));
      if (nonAttr.length > 0) {
        walk(nonAttr, depth + 1, el.id);
      }
    }
  }

  walk(elements, 0);
  return { nodes, edges };
}

/* ------------------------------------------------------------------ */
/*  Hook                                                              */
/* ------------------------------------------------------------------ */

export function useSysMLParser(kermlCode: string, showCode: boolean) {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [domainModel, setDomainModel] = useState<DomainModel | null>(null);
  const symbolsRef = useRef<DocumentSymbol[] | null>(null);

  /** Called by the SysMLEditor when the LSP pushes new symbols. */
  const handleDocumentSymbols = useCallback((symbols: DocumentSymbol[]) => {
    symbolsRef.current = symbols;
    const model = documentSymbolsToDomainModel(symbols);
    setDomainModel(model);

    if (!showCode) return;
    const { nodes: n, edges: e } = buildGraph(model.elements);
    if (n.length > 0) {
      setNodes(n);
      setEdges(e);
    }
  }, [showCode]);

  // When showCode becomes true, rebuild from latest symbols
  useEffect(() => {
    if (showCode && symbolsRef.current) {
      const model = documentSymbolsToDomainModel(symbolsRef.current);
      setDomainModel(model);
      const { nodes: n, edges: e } = buildGraph(model.elements);
      if (n.length > 0) {
        setNodes(n);
        setEdges(e);
      }
    }
  }, [showCode]);

  return { nodes, edges, setNodes, setEdges, domainModel, handleDocumentSymbols };
}
