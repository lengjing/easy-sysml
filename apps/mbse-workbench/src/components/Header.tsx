import React, { useState, useRef, useEffect } from 'react';
import {
  Box,
  Database,
  ChevronDown,
  Layers,
  Network,
  Play,
  FileText,
  FolderOpen,
  Plus,
  Check,
  PanelLeft,
  PanelRight,
} from 'lucide-react';
import { cn } from '../lib/utils';
import type { ProjectMeta } from '../lib/virtual-fs';

interface HeaderProps {
  activeProject: ProjectMeta | undefined;
  projects: ProjectMeta[];
  activeTab: string;
  setActiveTab: (tab: any) => void;
  onSwitchProject: (id: string) => void;
  onCreateProject: (name: string) => void;
  /** Panel visibility controls — moved here from Toolbar */
  leftPanelVisible: boolean;
  setLeftPanelVisible: (v: boolean) => void;
  rightPanelVisible: boolean;
  setRightPanelVisible: (v: boolean) => void;
}

/** Milliseconds to wait before focusing the new-project input (allows DOM to settle). */
const FOCUS_DELAY_MS = 50;

export const Header = ({
  activeProject,
  projects,
  activeTab,
  setActiveTab,
  onSwitchProject,
  onCreateProject,
  leftPanelVisible,
  setLeftPanelVisible,
  rightPanelVisible,
  setRightPanelVisible,
}: HeaderProps) => {
  const [projectMenuOpen, setProjectMenuOpen] = useState(false);
  const [showNewProjectInput, setShowNewProjectInput] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const menuRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  /* Close dropdown when clicking outside */
  useEffect(() => {
    if (!projectMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setProjectMenuOpen(false);
        setShowNewProjectInput(false);
        setNewProjectName('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [projectMenuOpen]);

  /* Focus the new-project input when it appears */
  useEffect(() => {
    if (showNewProjectInput) {
      setTimeout(() => inputRef.current?.focus(), FOCUS_DELAY_MS);
    }
  }, [showNewProjectInput]);

  const handleProjectSelect = (id: string) => {
    onSwitchProject(id);
    setProjectMenuOpen(false);
  };

  const handleCreateProject = () => {
    const name = newProjectName.trim();
    if (!name) return;
    onCreateProject(name);
    setNewProjectName('');
    setShowNewProjectInput(false);
    setProjectMenuOpen(false);
  };

  const handleNewProjectKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleCreateProject();
    if (e.key === 'Escape') {
      setShowNewProjectInput(false);
      setNewProjectName('');
    }
  };

  return (
    <header className="h-11 border-b border-[var(--border-color)] flex items-center justify-between px-3 bg-[var(--bg-header)] z-50 transition-colors duration-200 flex-shrink-0">
      {/* ── Left: Logo + Project Selector ── */}
      <div className="flex items-center gap-3 min-w-0">
        <div className="flex items-center gap-2 flex-shrink-0">
          <div className="w-7 h-7 bg-blue-600 rounded flex items-center justify-center">
            <Box className="text-white w-4 h-4" />
          </div>
          <span className="font-bold text-[13px] tracking-tight whitespace-nowrap">
            MBSE <span className="text-blue-500">Workbench</span>
          </span>
        </div>

        <div className="h-5 w-px bg-[var(--border-color)] flex-shrink-0" />

        {/* Project Selector Dropdown */}
        <div className="relative flex-shrink-0" ref={menuRef}>
          <button
            onClick={() => setProjectMenuOpen(v => !v)}
            className="flex items-center gap-1.5 bg-[var(--bg-sidebar)] border border-[var(--border-color)] rounded px-2 py-1 text-xs font-medium text-[var(--text-main)] hover:border-blue-500/60 transition-colors max-w-[180px]"
          >
            <Database size={13} className="text-blue-400 flex-shrink-0" />
            <span className="truncate">{activeProject?.name ?? '选择项目'}</span>
            <ChevronDown size={12} className="text-[var(--text-muted)] flex-shrink-0" />
          </button>

          {projectMenuOpen && (
            <div className="absolute top-full left-0 mt-1 w-64 bg-[var(--bg-sidebar)] border border-[var(--border-color)] rounded-lg shadow-xl z-[200] overflow-hidden">
              <div className="px-3 py-2 border-b border-[var(--border-color)]">
                <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest">
                  项目列表
                </span>
              </div>

              <div className="max-h-52 overflow-y-auto">
                {projects.map(p => (
                  <button
                    key={p.id}
                    onClick={() => handleProjectSelect(p.id)}
                    className="w-full flex items-center gap-2 px-3 py-2 text-left text-xs hover:bg-[var(--border-color)] transition-colors"
                  >
                    <FolderOpen size={13} className="text-blue-400 flex-shrink-0" />
                    <span className="flex-1 truncate text-[var(--text-main)]">{p.name}</span>
                    {p.id === activeProject?.id && (
                      <Check size={13} className="text-blue-500 flex-shrink-0" />
                    )}
                  </button>
                ))}
              </div>

              <div className="border-t border-[var(--border-color)] p-2">
                {showNewProjectInput ? (
                  <div className="flex items-center gap-1">
                    <input
                      ref={inputRef}
                      value={newProjectName}
                      onChange={e => setNewProjectName(e.target.value)}
                      onKeyDown={handleNewProjectKeyDown}
                      placeholder="新项目名称..."
                      className="flex-1 bg-[var(--bg-main)] border border-[var(--border-color)] rounded px-2 py-1 text-[11px] text-[var(--text-main)] focus:outline-none focus:border-blue-500"
                    />
                    <button
                      onClick={handleCreateProject}
                      disabled={!newProjectName.trim()}
                      className="p-1.5 text-blue-500 hover:bg-blue-500/10 rounded disabled:opacity-40 transition-colors"
                    >
                      <Check size={13} />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowNewProjectInput(true)}
                    className="w-full flex items-center gap-2 px-2 py-1.5 text-[11px] text-blue-500 hover:bg-blue-500/10 rounded transition-colors"
                  >
                    <Plus size={13} />
                    新建项目
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Center: Module Navigation Tabs ── */}
      <nav className="flex items-center gap-1 bg-[var(--bg-sidebar)] p-1 rounded-lg border border-[var(--border-color)] flex-shrink-0">
        {[
          { id: 'modeling',     label: '建模设计', icon: Layers   },
          { id: 'traceability', label: '需求追溯', icon: Network  },
          { id: 'simulation',   label: '行为仿真', icon: Play     },
          { id: 'reports',      label: '文档报告', icon: FileText },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1 rounded-md text-[11px] font-medium transition-all',
              activeTab === tab.id
                ? 'bg-blue-600 text-white shadow-sm shadow-blue-600/30'
                : 'text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--border-color)]',
            )}
          >
            <tab.icon size={13} />
            {tab.label}
          </button>
        ))}
      </nav>

      {/* ── Right: Panel toggles ── */}
      <div className="flex items-center gap-1 flex-shrink-0">
        <div className="flex items-center gap-0.5 bg-[var(--bg-sidebar)] rounded border border-[var(--border-color)] p-0.5">
          <button
            onClick={() => setLeftPanelVisible(!leftPanelVisible)}
            className={cn(
              'p-1.5 rounded transition-colors',
              leftPanelVisible
                ? 'text-blue-500 bg-blue-500/10'
                : 'text-[var(--text-muted)] hover:text-[var(--text-main)]',
            )}
            title={leftPanelVisible ? '收起左侧面板' : '展开左侧面板'}
          >
            <PanelLeft size={15} />
          </button>
          <button
            onClick={() => setRightPanelVisible(!rightPanelVisible)}
            className={cn(
              'p-1.5 rounded transition-colors',
              rightPanelVisible
                ? 'text-blue-500 bg-blue-500/10'
                : 'text-[var(--text-muted)] hover:text-[var(--text-main)]',
            )}
            title={rightPanelVisible ? '收起右侧面板' : '展开右侧面板'}
          >
            <PanelRight size={15} />
          </button>
        </div>
      </div>
    </header>
  );
};
