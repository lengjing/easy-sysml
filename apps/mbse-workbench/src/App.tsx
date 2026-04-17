import React, { useState, useCallback, useEffect, useMemo } from 'react';
import ReactFlow, { 
  Background, 
  Controls, 
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  Edge,
  ReactFlowProvider,
  BackgroundVariant,
  MarkerType,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { AnimatePresence } from 'motion/react';
import { Box } from 'lucide-react';

import { cn } from './lib/utils';
import { ModelElement, Project } from './types';
import { initialProject } from './data/initialProject';
import { KerMLNode } from './components/KerMLNode';
import { Header } from './components/Header';
import { SidebarLeft } from './components/SidebarLeft';
import { SidebarRight } from './components/SidebarRight';
import { ActivityBar } from './components/ActivityBar';
import { Toolbar } from './components/Toolbar';
import { StatusBar } from './components/StatusBar';
import { KerMLEditor } from './components/KerMLEditor';
import { TraceabilityMatrix } from './components/TraceabilityMatrix';
import { useKerMLParser } from './hooks/useKerMLParser';

const nodeTypes = {
  kerml: KerMLNode
};

function WorkbenchContent() {
  const [theme, setTheme] = useState<'dark' | 'light'>('light');
  const [project] = useState<Project>(initialProject);
  const [activeTab, setActiveTab] = useState<'modeling' | 'traceability' | 'simulation' | 'reports' | 'search' | 'database'>('modeling');
  const [leftPanelVisible, setLeftPanelVisible] = useState(true);
  const [rightPanelVisible, setRightPanelVisible] = useState(true);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [showCode, setShowCode] = useState(false);

  const [kermlCode, setKermlCode] = useState(`package UAV_System {
    block Control_Subsystem {
        description = "Executes complex flight control algorithms.";
        attribute frequency = "100Hz";
    }
    block Power_Subsystem {
        description = "Provides regulated power to all avionics.";
        attribute voltage = "24V";
    }
    Control_Subsystem -> Power_Subsystem;
}`);

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  const toggleTheme = useCallback(() => setTheme(prev => prev === 'dark' ? 'light' : 'dark'), []);

  const [nodes, setNodes, onNodesChange] = useNodesState(project.diagrams[0].nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(project.diagrams[0].edges);

  const { nodes: parsedNodes, edges: parsedEdges, parseError } = useKerMLParser(kermlCode, showCode);

  useEffect(() => {
    if (showCode && parsedNodes.length > 0) {
      setNodes(parsedNodes);
      setEdges(parsedEdges);
    }
  }, [parsedNodes, parsedEdges, showCode, setNodes, setEdges]);

  const onConnect = useCallback(
    (params: Connection | Edge) => setEdges((eds) => addEdge(params, eds)),
    [setEdges]
  );

  const syncCodeFromCanvas = useCallback(() => {
    let code = "package UAV_System {\n";
    nodes.forEach(node => {
      const name = node.data.label.replace(/\s+/g, '_');
      const type = (node.data.type || 'block').toLowerCase();
      code += `    ${type} ${name} {\n`;
      if (node.data.description) {
        code += `        description = "${node.data.description}";\n`;
      }
      if (node.data.status) {
        code += `        status = "${node.data.status}";\n`;
      }
      if (node.data.properties) {
        Object.entries(node.data.properties).forEach(([key, val]) => {
          code += `        attribute ${key} = "${val}";\n`;
        });
      }
      code += "    }\n";
    });
    edges.forEach(edge => {
      const source = nodes.find(n => n.id === edge.source)?.data.label.replace(/\s+/g, '_') || edge.source;
      const target = nodes.find(n => n.id === edge.target)?.data.label.replace(/\s+/g, '_') || edge.target;
      code += `    ${source} -> ${target};\n`;
    });
    code += "}";
    setKermlCode(code);
  }, [nodes, edges]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    setMousePos({ x: Math.round(e.clientX), y: Math.round(e.clientY) });
  }, []);

  const addNewElement = useCallback((type: string = 'Block') => {
    const id = `new-node-${nodes.length + 1}`;
    const newNode = {
      id,
      type: 'kerml',
      position: { x: 100 + Math.random() * 400, y: 100 + Math.random() * 400 },
      data: {
        label: `New ${type} ${nodes.length + 1}`,
        type: type,
        description: `New ${type} element created from explorer.`,
        status: 'Draft',
        properties: {}
      }
    };
    setNodes((nds) => nds.concat(newNode));
  }, [nodes.length, setNodes]);

  const handleDropElement = useCallback((draggedId: string, targetId: string) => {
    setNodes((nds) => {
      const draggedNode = nds.find(n => n.id === draggedId);
      if (!draggedNode) return nds;

      // If dropped on a root category, clear parentNode
      if (['package-root', 'req-root', 'struct-root', 'behavior-root'].includes(targetId)) {
        return nds.map(n => n.id === draggedId ? { ...n, parentNode: undefined, extent: undefined } : n);
      }

      // Otherwise, set parentNode to targetId
      const targetNode = nds.find(n => n.id === targetId);
      if (!targetNode) return nds;

      return nds.map(n => {
        if (n.id === draggedId) {
          return { 
            ...n, 
            parentNode: targetId, 
            extent: 'parent',
            position: { x: 20, y: 40 } // Default relative position
          };
        }
        return n;
      });
    });
  }, [setNodes]);

  const flowCanvas = useMemo(() => (
    <div className={cn("flex-1 relative transition-all duration-300", showCode ? "w-1/2" : "w-full")}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onMove={(_, viewport) => setZoom(viewport.zoom)}
        fitView
        nodeTypes={nodeTypes}
        snapToGrid={true}
        snapGrid={[10, 10]}
        defaultEdgeOptions={{ 
          type: 'smoothstep',
          animated: true,
          style: { strokeWidth: 1.5, stroke: theme === 'dark' ? '#64748b' : '#94a3b8' },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            width: 20,
            height: 20,
            color: theme === 'dark' ? '#64748b' : '#94a3b8',
          },
        }}
        onlyRenderVisibleElements={true}
        translateExtent={[[-1000, -1000], [2000, 2000]]}
        minZoom={0.1}
        maxZoom={2}
      >
        <Background color={theme === 'dark' ? "#1e293b" : "#f1f5f9"} gap={20} variant={BackgroundVariant.Lines} />
        <Controls className={cn(
          "border-none shadow-xl",
          theme === 'dark' ? "bg-slate-900" : "bg-white"
        )} />
        <MiniMap 
          nodeColor="#3b82f6" 
          maskColor={theme === 'dark' ? "rgba(15, 17, 21, 0.7)" : "rgba(255, 255, 255, 0.7)"}
          className={cn(
            "border rounded-lg shadow-2xl",
            theme === 'dark' ? "bg-slate-900 border-slate-700" : "bg-white border-slate-200"
          )}
        />
      </ReactFlow>
    </div>
  ), [nodes, edges, onNodesChange, onEdgesChange, onConnect, theme, showCode]);

  return (
    <div className="flex flex-col h-screen w-screen bg-[var(--bg-main)] text-[var(--text-main)] font-sans overflow-hidden transition-colors duration-200" onMouseMove={handleMouseMove}>
      <Header 
        project={project} 
        activeTab={activeTab} 
        setActiveTab={setActiveTab} 
        theme={theme} 
        toggleTheme={toggleTheme} 
      />

      <main className="flex flex-1 overflow-hidden relative">
        <ActivityBar activeTab={activeTab} setActiveTab={setActiveTab} />
        
        <AnimatePresence initial={false}>
          {leftPanelVisible && (
            <SidebarLeft 
              visible={leftPanelVisible} 
              activeTab={activeTab}
              onAddElement={addNewElement}
              onDropElement={handleDropElement}
              nodes={nodes}
            />
          )}
        </AnimatePresence>

        <section className="flex-1 flex flex-col bg-[var(--bg-canvas)] relative transition-colors duration-200">
          <Toolbar 
            leftPanelVisible={leftPanelVisible}
            setLeftPanelVisible={setLeftPanelVisible}
            rightPanelVisible={rightPanelVisible}
            setRightPanelVisible={setRightPanelVisible}
            showCode={showCode}
            setShowCode={setShowCode}
          />

          <div className="flex-1 relative group/canvas flex overflow-hidden">
            {activeTab === 'modeling' ? (
              <>
                {flowCanvas}
                {showCode && (
                  <KerMLEditor 
                    kermlCode={kermlCode}
                    setKermlCode={setKermlCode}
                    parseError={parseError}
                    syncCodeFromCanvas={syncCodeFromCanvas}
                  />
                )}
              </>
            ) : activeTab === 'traceability' ? (
              <TraceabilityMatrix />
            ) : (
              <div className="flex items-center justify-center h-full text-[var(--text-muted)] flex-col gap-6">
                <div className="w-20 h-20 rounded-full bg-[var(--bg-sidebar)] border border-[var(--border-color)] flex items-center justify-center">
                  <Box size={40} className="opacity-20 animate-pulse" />
                </div>
                <div className="text-center">
                  <h3 className="text-lg font-medium text-[var(--text-main)] mb-1">模块开发中</h3>
                  <p className="text-sm text-[var(--text-muted)]">该功能将在企业版 v2.1 中上线</p>
                </div>
              </div>
            )}
          </div>

          <StatusBar mousePos={mousePos} zoom={zoom} />
        </section>

        <AnimatePresence initial={false}>
          {rightPanelVisible && <SidebarRight visible={rightPanelVisible} />}
        </AnimatePresence>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <ReactFlowProvider>
      <WorkbenchContent />
    </ReactFlowProvider>
  );
}
