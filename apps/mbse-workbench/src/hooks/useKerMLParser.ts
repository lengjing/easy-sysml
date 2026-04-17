import { useState, useEffect, useCallback } from 'react';
import { Node, Edge } from 'reactflow';

export function useKerMLParser(kermlCode: string, showCode: boolean) {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);

  const parseCode = useCallback(() => {
    if (!showCode) return;

    try {
      const newNodes: Node[] = [];
      const newEdges: Edge[] = [];
      
      const elementRegex = /(block|package|requirement|behavior|action|state|constraint|interface)\s+(\w+)\s*\{([^}]*)\}/gi;
      let match;
      let x = 100;
      while ((match = elementRegex.exec(kermlCode)) !== null) {
        const type = match[1].charAt(0).toUpperCase() + match[1].slice(1).toLowerCase();
        const name = match[2];
        const content = match[3];
        
        const descMatch = /description\s*=\s*"([^"]*)"/.exec(content);
        const statusMatch = /status\s*=\s*"([^"]*)"/.exec(content);
        const attrMatches = [...content.matchAll(/attribute\s+(\w+)\s*=\s*"([^"]*)"/g)];
        
        const properties: any = {};
        attrMatches.forEach(m => {
          properties[m[1]] = m[2];
        });

        newNodes.push({
          id: name,
          type: 'kerml',
          position: { x, y: 150 },
          data: {
            label: name.replace(/_/g, ' '),
            type: type,
            description: descMatch ? descMatch[1] : '',
            status: statusMatch ? statusMatch[1] : 'Draft',
            properties
          }
        });
        x += 250;
      }

      const connRegex = /(\w+)\s*->\s*(\w+)/g;
      while ((match = connRegex.exec(kermlCode)) !== null) {
        newEdges.push({
          id: `e-${match[1]}-${match[2]}`,
          source: match[1],
          target: match[2],
          type: 'smoothstep',
          animated: true
        });
      }

      if (newNodes.length > 0) {
        setNodes(newNodes);
        setEdges(newEdges);
        setParseError(null);
      }
    } catch (e) {
      setParseError(e instanceof Error ? e.message : "Parsing failed");
    }
  }, [kermlCode, showCode]);

  useEffect(() => {
    const timer = setTimeout(() => {
      parseCode();
    }, 300); // Debounce parsing
    return () => clearTimeout(timer);
  }, [parseCode]);

  return { nodes, edges, parseError, setNodes, setEdges };
}
