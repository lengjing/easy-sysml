/**
 * DiagramCanvas — owns ReactFlow state (nodes, edges, contextMenu).
 * Isolated so that node-drag updates never re-render parent components.
 * Exposes addNode / dropNode / setExternalNodes via ref.
 */
import React, {
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import ReactFlow, {
  Background,
  Connection,
  ConnectionMode,
  Controls,
  Edge,
  MarkerType,
  Node,
  addEdge,
  useEdgesState,
  useNodesState,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { AlertCircle, Plus } from 'lucide-react';
import { SysMLNode } from './SysMLNode';
import { initialProject } from '../data/initialProject';

const nodeTypes = {
  sysml: SysMLNode,
};

/* ------------------------------------------------------------------ */
/*  Public types                                                       */
/* ------------------------------------------------------------------ */

/** Minimal structural element info synced to the parent (no positions). */
export interface SimpleElement {
  id: string;
  label: string;
  type: string;
  parentNode?: string;
}

export interface DiagramCanvasHandle {
  addNode: (type: string) => void;
  dropNode: (draggedId: string, targetId: string) => void;
  setExternalNodes: (nodes: Node[], edges: Edge[]) => void;
}

interface DiagramCanvasProps {
  /** Called when nodes are added or removed (not on position change). */
  onStructureChange: (elements: SimpleElement[]) => void;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

const DiagramCanvasInner = forwardRef<DiagramCanvasHandle, DiagramCanvasProps>(
  ({ onStructureChange }, ref) => {
    const [nodes, setNodes, onNodesChange] = useNodesState(
      initialProject.diagrams[0].nodes as Node[]
    );
    const [edges, setEdges, onEdgesChange] = useEdgesState(
      initialProject.diagrams[0].edges as Edge[]
    );
    const [contextMenu, setContextMenu] = useState<{
      x: number;
      y: number;
      nodeId: string;
    } | null>(null);

    // Notify parent only when the *set* of node IDs changes (not on drag)
    const prevIdsRef = useRef('');
    useEffect(() => {
      const ids = nodes
        .map(n => n.id)
        .sort()
        .join(',');
      if (ids === prevIdsRef.current) return;
      prevIdsRef.current = ids;
      onStructureChange(
        nodes.map(n => ({
          id: n.id,
          label: (n.data as any).label ?? (n.data as any).name ?? '',
          type: (n.data as any).type ?? (n.data as any).kind ?? '',
          parentNode: n.parentNode,
        }))
      );
    }, [nodes, onStructureChange]);

    /* ---------- Imperative handle ---------- */
    useImperativeHandle(
      ref,
      () => ({
        addNode: (type: string) => {
          setNodes(nds => {
            const id = `new-node-${nds.length + 1}`;
            return nds.concat({
              id,
              type: 'sysml',
              position: {
                x: 100 + Math.random() * 400,
                y: 100 + Math.random() * 400,
              },
              data: {
                label: `New ${type} ${nds.length + 1}`,
                type,
                kind: type,
                detail: type.toLowerCase(),
                category: 'other',
                status: 'Draft',
                properties: {},
                childCount: 0,
              },
            });
          });
        },

        dropNode: (draggedId: string, targetId: string) => {
          setNodes(nds => {
            const dragged = nds.find(n => n.id === draggedId);
            if (!dragged) return nds;
            const rootIds = ['package-root', 'req-root', 'struct-root', 'behavior-root'];
            if (rootIds.includes(targetId)) {
              return nds.map(n =>
                n.id === draggedId ? { ...n, parentNode: undefined, extent: undefined } : n
              );
            }
            if (!nds.find(n => n.id === targetId)) return nds;
            return nds.map(n =>
              n.id === draggedId
                ? { ...n, parentNode: targetId, extent: 'parent' as const, position: { x: 20, y: 40 } }
                : n
            );
          });
        },

        setExternalNodes: (newNodes: Node[], newEdges: Edge[]) => {
          setNodes(newNodes);
          setEdges(newEdges);
        },
      }),
      [setNodes, setEdges]
    );

    /* ---------- ReactFlow callbacks ---------- */
    const onConnect = useCallback(
      (params: Connection | Edge) => setEdges(eds => addEdge(params, eds)),
      [setEdges]
    );

    const onNodeContextMenu = useCallback((event: React.MouseEvent, node: Node) => {
      event.preventDefault();
      setContextMenu({ x: event.clientX, y: event.clientY, nodeId: node.id });
    }, []);

    const onPaneClick = useCallback(() => setContextMenu(null), []);

    const handleDeleteNode = useCallback(
      (id: string) => {
        setNodes(nds => nds.filter(n => n.id !== id));
        setContextMenu(null);
      },
      [setNodes]
    );

    const handleCreateChild = useCallback(
      (parentId: string) => {
        const id = `child-${parentId}-${Date.now()}`;
        setNodes(nds => {
          const parent = nds.find(n => n.id === parentId);
          return nds.concat({
            id,
            type: 'sysml',
            position: {
              x: (parent?.position.x ?? 100) + 40,
              y: (parent?.position.y ?? 100) + 200,
            },
            data: {
              label: 'New Child',
              type: 'Part',
              kind: 'Part',
              detail: 'part',
              category: 'other',
              status: 'Draft',
              properties: {},
              childCount: 0,
            },
          });
        });
        setEdges(eds =>
          eds.concat({
            id: `e-${parentId}-${id}`,
            source: parentId,
            target: id,
            type: 'smoothstep',
            markerEnd: { type: MarkerType.ArrowClosed },
          })
        );
        setContextMenu(null);
      },
      [setNodes, setEdges]
    );

    /* ---------- Render ---------- */
    return (
      <div className="w-full h-full relative">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeContextMenu={onNodeContextMenu}
          onPaneClick={onPaneClick}
          nodeTypes={nodeTypes}
          connectionMode={ConnectionMode.Loose}
          panActivationKeyCode={null}
          fitView
        >
          <Background color="var(--border-color)" gap={20} size={1} />
          <Controls className="!bg-[var(--bg-sidebar)] !border-[var(--border-color)] !shadow-sm" />
        </ReactFlow>

        {contextMenu && (
          <div
            className="fixed z-[100] bg-[var(--bg-sidebar)] border border-[var(--border-color)] shadow-xl rounded-md py-1 min-w-[160px] text-xs"
            style={{ top: contextMenu.y, left: contextMenu.x }}
          >
            <button
              onClick={() => handleCreateChild(contextMenu.nodeId)}
              className="w-full text-left px-3 py-2 hover:bg-indigo-50 dark:hover:bg-indigo-950 flex items-center gap-2 text-[var(--text-main)]"
            >
              <Plus className="w-3.5 h-3.5 text-indigo-500" />
              Create Child Element
            </button>
            <button
              onClick={() => handleDeleteNode(contextMenu.nodeId)}
              className="w-full text-left px-3 py-2 hover:bg-rose-50 dark:hover:bg-rose-950 flex items-center gap-2 text-rose-600 dark:text-rose-400 border-t border-[var(--border-color)]"
            >
              <AlertCircle className="w-3.5 h-3.5" />
              Delete Element
            </button>
            <div className="px-3 py-1.5 text-[9px] font-bold text-[var(--text-muted)] uppercase border-t border-[var(--border-color)]">
              ID: {contextMenu.nodeId}
            </div>
          </div>
        )}
      </div>
    );
  }
);

DiagramCanvasInner.displayName = 'DiagramCanvas';

// memo wrapper: prevents re-render when parent updates (e.g. theme, panel toggle)
export const DiagramCanvas = memo(DiagramCanvasInner);
