import React, { useState, useRef, useEffect } from 'react';
import {
  Files,
  Search,
  Play,
  Settings,
  Database,
  Network,
  Sun,
  Moon,
  UserCircle,
} from 'lucide-react';
import { cn } from '../lib/utils';

interface ActivityBarProps {
  activeTab: string;
  setActiveTab: (tab: any) => void;
  theme: 'dark' | 'light';
  toggleTheme: () => void;
}

export const ActivityBar = ({ activeTab, setActiveTab, theme, toggleTheme }: ActivityBarProps) => {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsRef = useRef<HTMLDivElement>(null);

  /* Close settings popover when clicking outside */
  useEffect(() => {
    if (!settingsOpen) return;
    const handler = (e: MouseEvent) => {
      if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) {
        setSettingsOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [settingsOpen]);

  const topIcons = [
    { id: 'modeling',     icon: Files,   label: '资源管理器' },
    { id: 'search',       icon: Search,  label: '搜索'       },
    { id: 'traceability', icon: Network, label: '需求追溯'   },
    { id: 'simulation',   icon: Play,    label: '行为仿真'   },
    { id: 'database',     icon: Database, label: '模型库'    },
  ];

  return (
    <div className="w-12 flex flex-col items-center py-2 bg-[var(--bg-activitybar)] border-r border-[var(--border-color)] z-50 transition-colors duration-200 flex-shrink-0">
      {/* Top navigation icons */}
      <div className="flex-1 flex flex-col gap-1 w-full items-center pt-2">
        {topIcons.map((item) => (
          <button
            key={item.id}
            onClick={() => setActiveTab(item.id as any)}
            className={cn(
              'relative p-2 rounded-md transition-all group w-9',
              activeTab === item.id
                ? 'text-blue-500'
                : 'text-[var(--text-muted)] hover:text-[var(--text-main)]',
            )}
            title={item.label}
          >
            <item.icon size={22} strokeWidth={1.5} />
            {activeTab === item.id && (
              <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-blue-500 rounded-r-full" />
            )}
            <div className="absolute left-full ml-2 px-2 py-1 bg-slate-800 text-white text-[10px] rounded opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-[100]">
              {item.label}
            </div>
          </button>
        ))}
      </div>

      {/* Bottom: user + settings */}
      <div className="flex flex-col gap-1 w-full items-center pb-2">
        {/* User avatar (non-functional placeholder) */}
        <button
          className="relative p-1 text-[var(--text-muted)] hover:text-[var(--text-main)] transition-all group"
          title="个人中心"
        >
          <UserCircle size={22} strokeWidth={1.5} />
          <div className="absolute left-full ml-2 px-2 py-1 bg-slate-800 text-white text-[10px] rounded opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-[100]">
            个人中心
          </div>
        </button>

        {/* Settings — expands a small popover with theme toggle etc. */}
        <div className="relative" ref={settingsRef}>
          <button
            onClick={() => setSettingsOpen(v => !v)}
            className={cn(
              'relative p-2 rounded-md transition-all group',
              settingsOpen
                ? 'text-blue-500 bg-blue-500/10'
                : 'text-[var(--text-muted)] hover:text-[var(--text-main)]',
            )}
            title="设置"
          >
            <Settings size={22} strokeWidth={1.5} />
            <div className="absolute left-full ml-2 px-2 py-1 bg-slate-800 text-white text-[10px] rounded opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-[100]">
              设置
            </div>
          </button>

          {settingsOpen && (
            <div className="absolute bottom-0 left-full ml-2 w-44 bg-[var(--bg-sidebar)] border border-[var(--border-color)] rounded-lg shadow-xl z-[200] overflow-hidden">
              <div className="px-3 py-2 border-b border-[var(--border-color)]">
                <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest">
                  设置
                </span>
              </div>
              {/* Theme toggle */}
              <button
                onClick={() => { toggleTheme(); setSettingsOpen(false); }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-[var(--text-main)] hover:bg-[var(--border-color)] transition-colors"
              >
                {theme === 'dark'
                  ? <Sun size={14} className="text-yellow-400" />
                  : <Moon size={14} className="text-blue-400" />}
                <span>{theme === 'dark' ? '切换浅色模式' : '切换深色模式'}</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
