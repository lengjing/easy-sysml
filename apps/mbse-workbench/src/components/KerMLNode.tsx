import React, { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { 
  Box, 
  Component, 
  Database, 
  Zap, 
  Activity, 
  Settings, 
  Circle,
  Package,
  FileCode,
  ArrowRightCircle,
  ShieldCheck,
  ShieldAlert,
  Clock,
  Link2,
  FileText,
  Layers
} from 'lucide-react';
import { cn } from '../lib/utils';

const KindIcon = ({ kind }: { kind: string }) => {
  switch (kind) {
    case 'Package': return <Package className="w-3.5 h-3.5" />;
    case 'Class':
    case 'Block': return <Box className="w-3.5 h-3.5" />;
    case 'DataType': return <Database className="w-3.5 h-3.5" />;
    case 'Part': return <Component className="w-3.5 h-3.5" />;
    case 'Attribute': return <Settings className="w-3.5 h-3.5" />;
    case 'Operation': return <Activity className="w-3.5 h-3.5" />;
    case 'Port': return <Circle className="w-3.5 h-3.5" />;
    case 'Behavior': return <Zap className="w-3.5 h-3.5" />;
    case 'Action': return <ArrowRightCircle className="w-3.5 h-3.5" />;
    case 'State': return <Circle className="w-3.5 h-3.5 fill-current" />;
    case 'Requirement': return <FileText className="w-3.5 h-3.5 text-rose-500" />;
    case 'Constraint': return <ShieldAlert className="w-3.5 h-3.5 text-amber-500" />;
    case 'Interface': return <Link2 className="w-3.5 h-3.5 text-indigo-500" />;
    default: return <FileCode className="w-3.5 h-3.5" />;
  }
};

const StatusIcon = ({ status }: { status?: string }) => {
  switch (status) {
    case 'Verified': return <ShieldCheck className="w-3 h-3 text-emerald-500" />;
    case 'Failed': return <ShieldAlert className="w-3 h-3 text-rose-500" />;
    case 'Review': return <Clock className="w-3 h-3 text-amber-500" />;
    case 'Draft': return <FileCode className="w-3 h-3 text-slate-400" />;
    default: return null;
  }
};

export const KerMLNode = memo(({ data, selected }: NodeProps) => {
  const { label, type, description, properties, status, children } = data;
  
  const getHeaderStyles = (kind: string) => {
    switch (kind) {
      case 'Package': return 'bg-slate-100 dark:bg-slate-800/50 border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300';
      case 'Class':
      case 'Block': return 'bg-blue-500 text-white border-blue-600 dark:border-blue-400';
      case 'Part': return 'bg-indigo-500 text-white border-indigo-600 dark:border-indigo-400';
      case 'Behavior':
      case 'Action': return 'bg-amber-500 text-white border-amber-600 dark:border-amber-400';
      case 'Requirement': return 'bg-rose-500 text-white border-rose-600 dark:border-rose-400';
      case 'Constraint': return 'bg-orange-500 text-white border-orange-600 dark:border-orange-400';
      default: return 'bg-slate-500 text-white border-slate-600 dark:border-slate-400';
    }
  };

  const headerClass = getHeaderStyles(type);

  return (
    <div className={cn(
      "flex flex-col bg-[var(--bg-input)] border border-slate-300 dark:border-slate-700 rounded-lg shadow-lg min-w-[220px] transition-all overflow-hidden group",
      selected ? "ring-2 ring-blue-500 border-blue-500 z-50 scale-[1.02]" : "hover:border-slate-400 dark:hover:border-slate-500"
    )}>
      {/* Handles */}
      <Handle 
        type="target" 
        position={Position.Top} 
        className="w-3 h-3 !bg-blue-500 !border-2 !border-white dark:!border-slate-900 !-top-1.5 transition-transform group-hover:scale-125" 
      />
      
      {/* Header Compartment */}
      <div className={cn("px-3 py-2 border-b flex items-center justify-between shadow-sm", headerClass)}>
        <div className="flex items-center gap-2">
          <div className="p-1 bg-white/20 rounded backdrop-blur-sm">
            <KindIcon kind={type} />
          </div>
          <div className="flex flex-col">
            <span className="text-[8px] font-black uppercase tracking-widest opacity-70 leading-none mb-0.5">«{type}»</span>
            <div className="font-bold text-xs font-mono tracking-tight truncate max-w-[140px]">{label}</div>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <StatusIcon status={status} />
        </div>
      </div>

      {/* Description Compartment */}
      {description && (
        <div className="px-3 py-2 bg-slate-50/50 dark:bg-slate-900/20 border-b border-slate-100 dark:border-slate-800">
          <div className="text-[10px] text-[var(--text-muted)] italic line-clamp-2 leading-relaxed font-sans">
            {description}
          </div>
        </div>
      )}

      {/* Properties Compartment */}
      {properties && Object.keys(properties).length > 0 && (
        <div className="p-0 border-b border-slate-100 dark:border-slate-800">
          <div className="px-3 py-1 bg-slate-100/30 dark:bg-slate-800/30 text-[8px] font-bold text-[var(--text-muted)] uppercase tracking-wider">Attributes</div>
          <div className="px-3 py-2 space-y-1.5">
            {Object.entries(properties).map(([key, val]) => (
              <div key={key} className="grid grid-cols-[1fr_auto] gap-2 items-center text-[10px] font-mono group/prop">
                <span className="text-[var(--text-muted)] truncate">{key}</span>
                <span className="text-[var(--text-main)] font-semibold bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700">
                  {String(val)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Nested Elements Indicator */}
      {children && children.length > 0 && (
        <div className="px-3 py-1.5 bg-blue-50/30 dark:bg-blue-900/10 flex items-center gap-2">
          <Layers size={10} className="text-blue-500" />
          <span className="text-[9px] font-bold text-blue-600 dark:text-blue-400">
            {children.length} Nested Elements
          </span>
        </div>
      )}

      {/* Footer / Meta */}
      <div className="px-3 py-1 bg-slate-50/30 dark:bg-slate-900/30 flex justify-between items-center border-t border-slate-100 dark:border-slate-800">
        <span className="text-[8px] text-[var(--text-muted)] font-mono">ID: {label.toLowerCase().replace(/\s+/g, '_')}</span>
        <div className="flex gap-1">
          <div className="w-1 h-1 rounded-full bg-slate-300 dark:bg-slate-700" />
          <div className="w-1 h-1 rounded-full bg-slate-300 dark:bg-slate-700" />
        </div>
      </div>

      <Handle 
        type="source" 
        position={Position.Bottom} 
        className="w-3 h-3 !bg-blue-500 !border-2 !border-white dark:!border-slate-900 !-bottom-1.5 transition-transform group-hover:scale-125" 
      />
    </div>
  );
});

KerMLNode.displayName = 'KerMLNode';
