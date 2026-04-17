import React from 'react';
import { 
  Files, 
  Search, 
  GitBranch, 
  Play, 
  Layers, 
  Settings, 
  UserCircle,
  Database,
  Network
} from 'lucide-react';
import { cn } from '../lib/utils';

interface ActivityBarProps {
  activeTab: string;
  setActiveTab: (tab: any) => void;
}

export const ActivityBar = ({ activeTab, setActiveTab }: ActivityBarProps) => {
  const topIcons = [
    { id: 'modeling', icon: Files, label: 'Explorer' },
    { id: 'search', icon: Search, label: 'Search' },
    { id: 'traceability', icon: Network, label: 'Traceability' },
    { id: 'simulation', icon: Play, label: 'Simulation' },
    { id: 'database', icon: Database, label: 'Model Repository' },
  ];

  const bottomIcons = [
    { id: 'profile', icon: UserCircle, label: 'Profile' },
    { id: 'settings', icon: Settings, label: 'Settings' },
  ];

  return (
    <div className="w-12 flex flex-col items-center py-4 bg-[var(--bg-activitybar)] border-r border-[var(--border-color)] z-50 transition-colors duration-200">
      <div className="flex-1 flex flex-col gap-4 w-full items-center">
        {topIcons.map((item) => (
          <button
            key={item.id}
            onClick={() => setActiveTab(item.id as any)}
            className={cn(
              "relative p-2 rounded-md transition-all group",
              activeTab === item.id 
                ? "text-blue-500" 
                : "text-[var(--text-muted)] hover:text-[var(--text-main)]"
            )}
            title={item.label}
          >
            <item.icon size={24} strokeWidth={1.5} />
            {activeTab === item.id && (
              <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-6 bg-blue-500 rounded-r-full" />
            )}
            <div className="absolute left-full ml-2 px-2 py-1 bg-slate-800 text-white text-[10px] rounded opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-[100]">
              {item.label}
            </div>
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-4 w-full items-center">
        {bottomIcons.map((item) => (
          <button
            key={item.id}
            className="relative p-2 text-[var(--text-muted)] hover:text-[var(--text-main)] transition-all group"
            title={item.label}
          >
            <item.icon size={24} strokeWidth={1.5} />
            <div className="absolute left-full ml-2 px-2 py-1 bg-slate-800 text-white text-[10px] rounded opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-[100]">
              {item.label}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};
