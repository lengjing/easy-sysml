import React, { useState, useCallback, useEffect, useRef } from 'react';
import { ReactFlowProvider } from 'reactflow';
import { AnimatePresence } from 'motion/react';
import { Box } from 'lucide-react';

import { Project } from './types';
import { initialProject } from './data/initialProject';
import { DiagramCanvas, DiagramCanvasHandle, SimpleElement } from './components/DiagramCanvas';
import { Header } from './components/Header';
import { SidebarLeft } from './components/SidebarLeft';
import { SidebarRight } from './components/SidebarRight';
import { ActivityBar } from './components/ActivityBar';
import { Toolbar } from './components/Toolbar';
import { StatusBar } from './components/StatusBar';
import { SysMLEditorPanel } from './components/SysMLEditorPanel';
import { TraceabilityMatrix } from './components/TraceabilityMatrix';
import { useSysMLParser } from './hooks/useSysMLParser';

function WorkbenchContent() {
  const [theme, setTheme] = useState<'dark' | 'light'>('light');
  const [project] = useState<Project>(initialProject);
  const [activeTab, setActiveTab] = useState<'modeling' | 'traceability' | 'simulation' | 'reports' | 'search' | 'database'>('modeling');
  const [leftPanelVisible, setLeftPanelVisible] = useState(true);
  const [rightPanelVisible, setRightPanelVisible] = useState(true);
  const [showCode, setShowCode] = useState(false);

  // Structural element list for sidebar (no positions — only updated on add/remove)
  const [elements, setElements] = useState<SimpleElement[]>(() =>
    initialProject.diagrams[0].nodes.map(n => ({
      id: n.id,
      label: (n.data as any).label ?? '',
      type: (n.data as any).type ?? '',
      parentNode: n.parentNode,
    }))
  );

  const [kermlCode, setKermlCode] = useState(`package UAV_System {
    part def Control_Subsystem {
        doc /* Executes complex flight control algorithms. */
        attribute frequency : String;
    }
    part def Power_Subsystem {
        doc /* Provides regulated power to all avionics. */
        attribute voltage : String;
    }
}`);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  const toggleTheme = useCallback(() => setTheme(prev => (prev === 'dark' ? 'light' : 'dark')), []);

  // Ref to the canvas — used to push addNode / dropNode / setExternalNodes
  const canvasRef = useRef<DiagramCanvasHandle>(null);

  // LSP document symbols → parsed nodes/edges
  const { nodes: parsedNodes, edges: parsedEdges, domainModel, handleDocumentSymbols } =
    useSysMLParser(kermlCode, showCode);

  // Push parsed nodes into the canvas when available
  useEffect(() => {
    if (showCode && parsedNodes.length > 0) {
      canvasRef.current?.setExternalNodes(parsedNodes, parsedEdges);
    }
  }, [parsedNodes, parsedEdges, showCode]);

  // Stable callbacks for sidebar actions — call into canvas via ref
  const addNewElement = useCallback((type: string = 'Block') => {
    canvasRef.current?.addNode(type);
  }, []);

  const handleDropElement = useCallback((draggedId: string, targetId: string) => {
    canvasRef.current?.dropNode(draggedId, targetId);
  }, []);

  // Sync structural element list from canvas (fires only on add/remove, not drag)
  const handleStructureChange = useCallback((els: SimpleElement[]) => {
    setElements(els);
  }, []);

  return (
    <div className="flex flex-col h-screen w-screen bg-[var(--bg-main)] text-[var(--text-main)] font-sans overflow-hidden transition-colors duration-200">
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
              nodes={elements}
              domainModel={domainModel}
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

          <div className="flex-1 relative flex overflow-hidden">
            {activeTab === 'modeling' ? (
              <>
                {/* Canvas owns all ReactFlow state — no re-render on node drag */}
                <div className={`relative transition-all duration-300 ${showCode ? 'w-1/2' : 'w-full'}`}>
                  <DiagramCanvas ref={canvasRef} onStructureChange={handleStructureChange} />
                </div>

                {showCode && (
                  <SysMLEditorPanel
                    code={kermlCode}
                    setCode={setKermlCode}
                    onDocumentSymbols={handleDocumentSymbols}
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

          <StatusBar />
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
