import React, { useEffect, useState } from 'react';
import { useViewport } from 'reactflow';
import { MousePointer2, ZoomIn, CheckCircle2, History, Terminal, FileCode } from 'lucide-react';

interface StatusBarProps {
  /** Name of the currently active file. */
  activeFileName?: string;
}

export const StatusBar = ({ activeFileName }: StatusBarProps) => {
  const { zoom } = useViewport();
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      setMousePos({ x: Math.round(e.clientX), y: Math.round(e.clientY) });
    };
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);
  return (
    <footer className="h-7 border-t border-[var(--border-color)] bg-[var(--bg-header)] flex items-center justify-between px-3 text-[10px] text-[var(--text-muted)] font-medium transition-colors duration-200">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1.5 text-[var(--text-muted)]">
          <MousePointer2 size={12} />
          <span>X: {mousePos.x} Y: {mousePos.y}</span>
        </div>
        <div className="h-3 w-px bg-[var(--border-color)]" />
        <div className="flex items-center gap-1.5 text-[var(--text-muted)]">
          <ZoomIn size={12} />
          <span>缩放: {Math.round(zoom * 100)}%</span>
        </div>
        <div className="h-3 w-px bg-[var(--border-color)]" />
        <div className="flex items-center gap-1.5 text-blue-500 font-bold">
          <CheckCircle2 size={12} />
          <span>模型校验通过 (100%)</span>
        </div>
      </div>
      <div className="flex items-center gap-4">
        <button className="flex items-center gap-1.5 hover:text-[var(--text-main)] transition-colors">
          <History size={12} />
          <span>操作历史 (12)</span>
        </button>
        <div className="h-3 w-px bg-[var(--border-color)]" />
        {activeFileName && (
          <>
            <div className="flex items-center gap-1.5 text-[var(--text-muted)]">
              <FileCode size={12} />
              <span>{activeFileName}</span>
            </div>
            <div className="h-3 w-px bg-[var(--border-color)]" />
          </>
        )}
        <button className="flex items-center gap-1.5 hover:text-[var(--text-main)] transition-colors">
          <Terminal size={12} />
          <span>终端日志</span>
        </button>
        <div className="h-3 w-px bg-[var(--border-color)]" />
        <div className="flex items-center gap-2">
          <span className="text-[var(--text-muted)]">SysML v2.0</span>
          <div className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]" />
        </div>
      </div>
    </footer>
  );
};
