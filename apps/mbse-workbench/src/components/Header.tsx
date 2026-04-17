import React from 'react';
import { 
  Box, 
  Database, 
  ChevronDown, 
  Layers, 
  Network, 
  Play, 
  FileText, 
  Sun, 
  Moon, 
  Bell, 
  HelpCircle, 
  Settings 
} from 'lucide-react';
import { cn } from '../lib/utils';
import { Project } from '../types';

interface HeaderProps {
  project: Project;
  activeTab: string;
  setActiveTab: (tab: any) => void;
  theme: 'dark' | 'light';
  toggleTheme: () => void;
}

export const Header = ({ 
  project, 
  activeTab, 
  setActiveTab, 
  theme, 
  toggleTheme 
}: HeaderProps) => {
  return (
    <header className="h-12 border-b border-[var(--border-color)] flex items-center justify-between px-4 bg-[var(--bg-header)] z-50 transition-colors duration-200">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 cursor-pointer group">
          <div className="w-8 h-8 bg-blue-600 rounded flex items-center justify-center group-hover:bg-blue-500 transition-colors">
            <Box className="text-white w-5 h-5" />
          </div>
          <div className="flex flex-col">
            <span className="font-bold text-sm tracking-tight leading-none">MBSE <span className="text-blue-500">Workbench</span></span>
            <span className="text-[10px] text-[var(--text-muted)] font-medium">Enterprise Edition</span>
          </div>
        </div>
        <div className="h-6 w-px bg-[var(--border-color)] mx-2" />
        <div className="flex items-center gap-2 bg-[var(--bg-sidebar)] border border-[var(--border-color)] rounded px-2 py-1 cursor-pointer hover:bg-[var(--border-color)] transition-colors">
          <Database size={14} className="text-blue-400" />
          <span className="text-xs font-medium text-[var(--text-main)]">{project.name}</span>
          <ChevronDown size={12} className="text-[var(--text-muted)]" />
        </div>
      </div>

      <nav className="flex items-center gap-1 bg-[var(--bg-sidebar)] p-1 rounded-lg border border-[var(--border-color)]">
        {[
          { id: 'modeling', label: '建模设计', icon: Layers },
          { id: 'traceability', label: '需求追溯', icon: Network },
          { id: 'simulation', label: '行为仿真', icon: Play },
          { id: 'reports', label: '文档报告', icon: FileText },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={cn(
              "flex items-center gap-2 px-4 py-1.5 rounded-md text-xs font-medium transition-all",
              activeTab === tab.id 
                ? "bg-blue-600 text-white shadow-lg shadow-blue-600/20" 
                : "text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--border-color)]"
            )}
          >
            <tab.icon size={14} />
            {tab.label}
          </button>
        ))}
      </nav>

      <div className="flex items-center gap-3">
        <button 
          onClick={toggleTheme}
          className="p-1.5 text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--border-color)] rounded-md transition-colors"
          title={theme === 'dark' ? "切换到浅色模式" : "切换到深色模式"}
        >
          {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
        </button>
        <div className="h-4 w-px bg-[var(--border-color)]" />
        <div className="flex items-center gap-1.5 px-2 py-1 bg-green-500/10 border border-green-500/20 rounded text-[10px] text-green-400 font-medium">
          <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
          在线协同中
        </div>
        <div className="h-4 w-px bg-[var(--border-color)]" />
        <div className="flex items-center gap-1">
          <button className="p-1.5 text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--border-color)] rounded-md transition-colors" title="通知">
            <Bell size={18} />
          </button>
          <button className="p-1.5 text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--border-color)] rounded-md transition-colors" title="帮助">
            <HelpCircle size={18} />
          </button>
          <button className="p-1.5 text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--border-color)] rounded-md transition-colors" title="设置">
            <Settings size={18} />
          </button>
        </div>
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-xs font-bold border border-[var(--border-color)] cursor-pointer hover:ring-2 hover:ring-blue-500/50 transition-all">
          JS
        </div>
      </div>
    </header>
  );
};
