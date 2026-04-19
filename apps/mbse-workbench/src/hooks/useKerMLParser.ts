import { useState, useEffect, useCallback } from 'react';
import { Node, Edge } from 'reactflow';
import { parseSysMLToDomainModel, type DomainModel, type DomainElement } from '../editor/sysml-ast-parser';

export function useKerMLParser(kermlCode: string, showCode: boolean) {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [domainModel, setDomainModel] = useState<DomainModel | null>(null);

  const parseCode = useCallback(() => {
    if (!showCode || !kermlCode.trim()) return;

    try {
      const model = parseSysMLToDomainModel(kermlCode);
      setDomainModel(model);

      if (model.errors.length > 0) {
        setParseError(model.errors.map(e => `L${e.line}:${e.column} ${e.message}`).join('\n'));
      } else {
        setParseError(null);
      }

      // Convert domain elements to ReactFlow nodes with proper layout.
      // Each depth level gets a unique x offset; siblings at the same depth
      // are stacked vertically using their index within that depth.
      const newNodes: Node[] = [];
      const newEdges: Edge[] = [];
      const depthCounters = new Map<number, number>();

      function flattenElements(elements: DomainElement[], depth: number) {
        for (let i = 0; i < elements.length; i++) {
          const el = elements[i];
          const row = depthCounters.get(depth) ?? 0;
          depthCounters.set(depth, row + 1);

          newNodes.push({
            id: el.id,
            type: 'kerml',
            position: { x: 100 + depth * 280, y: 80 + row * 180 },
            data: {
              label: el.name,
              type: mapTypeForDisplay(el.type),
              description: el.description,
              status: 'Draft',
              properties: el.properties,
            },
          });

          // Add edges for parent-child relationships
          const nonAttrChildren = el.children.filter(
            c => c.type !== 'Attribute' && c.type !== 'AttributeUsage',
          );
          for (const child of nonAttrChildren) {
            newEdges.push({
              id: `e-${el.id}-${child.id}`,
              source: el.id,
              target: child.id,
              type: 'smoothstep',
              animated: true,
            });
          }
          if (nonAttrChildren.length > 0) {
            flattenElements(nonAttrChildren, depth + 1);
          }
        }
      }

      flattenElements(model.elements, 0);

      // Add domain-level edges
      for (const edge of model.edges) {
        newEdges.push({
          id: `e-${edge.sourceId}-${edge.targetId}`,
          source: edge.sourceId,
          target: edge.targetId,
          type: 'smoothstep',
          animated: true,
        });
      }

      if (newNodes.length > 0) {
        setNodes(newNodes);
        setEdges(newEdges);
      }
    } catch (e) {
      setParseError(e instanceof Error ? e.message : 'Parsing failed');
    }
  }, [kermlCode, showCode]);

  useEffect(() => {
    const timer = setTimeout(() => parseCode(), 300);
    return () => clearTimeout(timer);
  }, [parseCode]);

  return { nodes, edges, parseError, setNodes, setEdges, domainModel };
}

function mapTypeForDisplay(type: string): string {
  switch (type) {
    case 'PartDefinition': return 'Block';
    case 'PartUsage':
    case 'Part': return 'Part';
    case 'AttributeDefinition': return 'Attribute';
    case 'AttributeUsage':
    case 'Attribute': return 'Attribute';
    case 'PortDefinition':
    case 'Port':
    case 'PortUsage': return 'Port';
    case 'ActionDefinition':
    case 'Action':
    case 'ActionUsage': return 'Action';
    case 'StateDefinition':
    case 'State':
    case 'StateUsage': return 'State';
    case 'RequirementDefinition':
    case 'Requirement':
    case 'RequirementUsage': return 'Requirement';
    case 'ConstraintDefinition':
    case 'Constraint':
    case 'ConstraintUsage': return 'Constraint';
    case 'ConnectionDefinition': return 'Interface';
    case 'InterfaceDefinition': return 'Interface';
    case 'Package': return 'Package';
    default: return type;
  }
}
