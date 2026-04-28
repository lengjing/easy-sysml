import React, { useState, useCallback, useEffect, useRef } from 'react';
import { ReactFlowProvider } from 'reactflow';
import { AnimatePresence } from 'motion/react';
import { Box } from 'lucide-react';

import { cn } from './lib/utils';
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
import { AIChatPanel } from './components/ai/AIChatPanel';
import { useSysMLParser } from './hooks/useSysMLParser';
import { useFileSystem } from './hooks/useFileSystem';
import {
  createProject as createServerProject,
  listProjects,
  type ServerProjectRecord,
} from './lib/sysml-server';

function toWorkbenchProject(projectRecord: Pick<ServerProjectRecord, 'id' | 'name'>): Project {
  return {
    ...initialProject,
    id: projectRecord.id,
    name: projectRecord.name,
    elements: [],
    relationships: [],
    diagrams: initialProject.diagrams.map(diagram => ({
      ...diagram,
      nodes: [],
      edges: [],
    })),
  };
}

function WorkbenchContent() {
  const [theme, setTheme] = useState<'dark' | 'light'>('light');
  const [project, setProject] = useState<Project>(initialProject);
  const [projectRecords, setProjectRecords] = useState<ServerProjectRecord[]>([]);
  const [projectBusy, setProjectBusy] = useState(false);
  const [activeTab, setActiveTab] = useState<'modeling' | 'traceability' | 'simulation' | 'reports' | 'search' | 'database'>('modeling');
  const [leftPanelVisible, setLeftPanelVisible] = useState(true);
  const [rightPanelVisible, setRightPanelVisible] = useState(true);
  const [showCode, setShowCode] = useState(false);
  const [showAI, setShowAI] = useState(false);
  const currentProjectId = projectRecords.some(item => item.id === project.id)
    ? project.id
    : undefined;

  // Structural element list for sidebar (no positions — only updated on add/remove)
  const [elements, setElements] = useState<SimpleElement[]>(() =>
    initialProject.diagrams[0].nodes.map(n => ({
      id: n.id,
      label: (n.data as any).label ?? '',
      type: (n.data as any).type ?? '',
      parentNode: n.parentNode,
    }))
  );

  // Multi-file system
  const {
    ready: fsReady,
    nodes: fsNodes,
    openTabs,
    activeFileId,
    activeFileContent,
    activeFile,
    openFile,
    closeTab,
    setActiveFile,
    updateFileContent,
    createFile,
    createDirectory,
    renameNode,
    deleteNode,
    moveNode,
    getChildren,
    getPath,
    getUri,
    fs,
  } = useFileSystem(currentProjectId);

  // Derive the editor code from the active file
  const kermlCode = activeFileContent;

  const setKermlCode = useCallback((code: string) => {
    if (activeFileId) {
      updateFileContent(activeFileId, code);
    }
  }, [activeFileId, updateFileContent]);

  // Get current file URI for LSP
  const currentFileUri = activeFileId ? getUri(activeFileId) : undefined;

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  useEffect(() => {
    let active = true;

    const loadProjects = async () => {
      setProjectBusy(true);
      try {
        const records = await listProjects();
        if (!active) return;
        setProjectRecords(records);
        if (records.length > 0) {
          setProject(toWorkbenchProject(records[0]));
        }
      } catch (error) {
        console.error('[easy-sysml] Failed to load projects:', error);
      } finally {
        if (active) {
          setProjectBusy(false);
        }
      }
    };

    void loadProjects();

    return () => {
      active = false;
    };
  }, []);

  const toggleTheme = useCallback(() => setTheme(prev => (prev === 'dark' ? 'light' : 'dark')), []);

  const handleSelectProject = useCallback((projectId: string) => {
    const selected = projectRecords.find(item => item.id === projectId);
    if (!selected) return;
    setProject(toWorkbenchProject(selected));
  }, [projectRecords]);

  const handleCreateProject = useCallback(async () => {
    const name = window.prompt('请输入项目名称', `新建项目 ${projectRecords.length + 1}`)?.trim();
    if (!name) {
      return;
    }

    setProjectBusy(true);
    try {
      const created = await createServerProject({ name });
      setProjectRecords(prev => [created, ...prev.filter(item => item.id !== created.id)]);
      setProject(toWorkbenchProject(created));
      setShowCode(false);
      setShowAI(false);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : '创建项目失败');
    } finally {
      setProjectBusy(false);
    }
  }, [projectRecords.length]);

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

  // Callback for AI "Apply" button — replaces editor code and opens editor
  const handleApplyAICode = useCallback((code: string) => {
    setKermlCode(code);
    setShowCode(true);
  }, [setKermlCode]);

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

  // Helper: get file name for tab display
  const getFileName = useCallback((fileId: string) => {
    const node = fs.getNode(fileId);
    return node?.name ?? 'untitled';
  }, [fs]);

  return (
    <div className="flex flex-col h-screen w-screen bg-[var(--bg-main)] text-[var(--text-main)] font-sans overflow-hidden transition-colors duration-200">
      <Header
        project={project}
        projects={projectRecords}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        theme={theme}
        toggleTheme={toggleTheme}
        onSelectProject={handleSelectProject}
        onCreateProject={handleCreateProject}
        projectBusy={projectBusy}
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
              fsNodes={fsNodes}
              activeFileId={activeFileId}
              getChildren={getChildren}
              onOpenFile={(fileId) => { openFile(fileId); setShowCode(true); }}
              onCreateFile={(name, parentId) => { createFile(name, parentId); setShowCode(true); }}
              onCreateDirectory={createDirectory}
              onRenameNode={renameNode}
              onDeleteNode={deleteNode}
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
            showAI={showAI}
            setShowAI={setShowAI}
          />

          <div className="flex-1 relative flex overflow-hidden">
            {activeTab === 'modeling' ? (
              <>
                {/* Canvas — takes remaining space */}
                <div className={cn(
                  'relative transition-all duration-300',
                  showCode && showAI ? 'w-1/3' : showCode || showAI ? 'w-1/2' : 'w-full',
                )}>
                  <DiagramCanvas ref={canvasRef} onStructureChange={handleStructureChange} />
                </div>

                {/* Keep editor mounted to preserve undo/redo history */}
                <SysMLEditorPanel
                  code={kermlCode}
                  setCode={setKermlCode}
                  onDocumentSymbols={handleDocumentSymbols}
                  visible={showCode}
                  openTabs={openTabs}
                  activeFileId={activeFileId}
                  onSelectTab={(fileId) => setActiveFile(fileId)}
                  onCloseTab={closeTab}
                  getFileName={getFileName}
                  fileUri={currentFileUri}
                />

                {/* AI Chat Panel */}
                {showAI && (
                  <div className="w-[420px] border-l border-[var(--border-color)] flex-shrink-0">
                    <AIChatPanel
                      onApplyCode={handleApplyAICode}
                      currentCode={kermlCode}
                    />
                  </div>
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

          <StatusBar activeFileName={activeFile?.name} />
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
