import React from 'react';
import { 
  PanelLeft, 
  PanelRight, 
  Code, 
  Save, 
  Download, 
  Play, 
  History, 
  Layers 
} from 'lucide-react';
import { cn } from '../lib/utils';

interface ToolbarProps {
  leftPanelVisible: boolean;
  setLeftPanelVisible: (visible: boolean) => void;
  rightPanelVisible: boolean;
  setRightPanelVisible: (visible: boolean) => void;
  showCode: boolean;
  setShowCode: (show: boolean) => void;
}

export const Toolbar = ({
  leftPanelVisible,
  setLeftPanelVisible,
  rightPanelVisible,
  setRightPanelVisible,
  showCode,
  setShowCode
}: ToolbarProps) => {
  return (
    <div className="h-10 border-b border-[var(--border-color)] flex items-center justify-between px-4 bg-[var(--bg-sidebar)]/50 backdrop-blur-sm transition-colors duration-200">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1 bg-[var(--bg-main)] rounded p-0.5 border border-[var(--border-color)]">
          <button 
            onClick={() => setLeftPanelVisible(!leftPanelVisible)}
            className={cn("p-1 rounded transition-colors", !leftPanelVisible ? "text-blue-400 bg-blue-400/10" : "text-[var(--text-muted)] hover:text-[var(--text-main)]")}
            title="切换左侧面板"
          >
            <PanelLeft size={16} />
          </button>
          <button 
            onClick={() => setRightPanelVisible(!rightPanelVisible)}
            className={cn("p-1 rounded transition-colors", !rightPanelVisible ? "text-blue-400 bg-blue-400/10" : "text-[var(--text-muted)] hover:text-[var(--text-main)]")}
            title="切换右侧面板"
          >
            <PanelRight size={16} />
          </button>
        </div>
        <div className="h-4 w-px bg-[var(--border-color)]" />
        <button 
          onClick={() => setShowCode(!showCode)}
          className={cn(
            "flex items-center gap-1.5 px-2 py-1 text-[11px] font-medium rounded transition-colors",
            showCode ? "text-blue-400 bg-blue-400/10" : "text-[var(--text-main)] hover:bg-[var(--border-color)]"
          )}
        >
          <Code size={14} />
          {showCode ? "隐藏代码" : "显示代码"}
        </button>
        <div className="h-4 w-px bg-[var(--border-color)]" />
        <div className="flex items-center gap-1">
          <button className="flex items-center gap-1.5 px-2 py-1 text-[11px] font-medium text-[var(--text-main)] hover:bg-[var(--border-color)] rounded transition-colors">
            <Save size={14} />
            保存
          </button>
          <button className="flex items-center gap-1.5 px-2 py-1 text-[11px] font-medium text-[var(--text-main)] hover:bg-[var(--border-color)] rounded transition-colors">
            <Download size={14} />
            导出
          </button>
          <button className="flex items-center gap-1.5 px-2 py-1 text-[11px] font-medium text-blue-500 hover:bg-blue-500/10 rounded transition-colors">
            <Play size={14} />
            运行仿真
          </button>
        </div>
        <div className="h-4 w-px bg-[var(--border-color)]" />
        <div className="flex items-center gap-1 text-[var(--text-muted)]">
          <button className="p-1 hover:text-[var(--text-main)] transition-colors" title="撤销"><History size={14} className="rotate-180" /></button>
          <button className="p-1 hover:text-[var(--text-main)] transition-colors" title="重做"><History size={14} /></button>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 text-[10px] text-[var(--text-muted)] bg-[var(--bg-main)] px-2 py-1 rounded border border-[var(--border-color)]">
          <Layers size={12} />
          <span>BDD: 系统层级结构图</span>
        </div>
        <div className="flex -space-x-2">
          {[1, 2, 3].map(i => (
            <div key={i} className="w-6 h-6 rounded-full border-2 border-[var(--bg-canvas)] bg-slate-700 flex items-center justify-center text-[8px] font-bold ring-1 ring-[var(--border-color)] text-white">
              U{i}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
