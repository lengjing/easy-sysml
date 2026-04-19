/**
 * SysML v2 Model Node Component
 *
 * Professional enterprise-grade SysML v2 BDD/model node rendering
 * following UML/SysML compartment conventions:
 *
 *  ┌──────────────────────────────┐
 *  │ «stereotype»                 │  ← stereotype tag
 *  │  ElementName                 │  ← name compartment
 *  ├──────────────────────────────┤
 *  │  attributes / properties     │  ← attribute compartment
 *  ├──────────────────────────────┤
 *  │  ↳ N nested elements         │  ← children indicator
 *  └──────────────────────────────┘
 *
 * Supports ALL SysML v2 element types with distinct visual styles.
 */
import React, { memo } from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';
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
  Layers,
  Eye,
  Target,
  Cpu,
  GitBranch,
  Workflow,
  CheckSquare,
  LayoutGrid,
  Inbox,
  Repeat,
  Play,
  Send,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '../lib/utils';

/* ------------------------------------------------------------------ */
/*  Icon mapping for every SysML v2 element type                      */
/* ------------------------------------------------------------------ */

const ICON_MAP: Record<string, LucideIcon> = {
  Package,
  Block: Box,
  Part: Component,
  Attribute: Settings,
  Port: Circle,
  Interface: Link2,
  Allocation: LayoutGrid,
  Action: ArrowRightCircle,
  State: Circle,
  Calculation: Cpu,
  Constraint: ShieldAlert,
  Requirement: FileText,
  Concern: FileText,
  Case: CheckSquare,
  UseCase: Target,
  AnalysisCase: Activity,
  VerificationCase: ShieldCheck,
  Item: Inbox,
  Enumeration: Database,
  View: Eye,
  Viewpoint: Target,
  Rendering: Eye,
  Metadata: Database,
  Occurrence: Zap,
  Flow: GitBranch,
  Transition: Workflow,
  ExhibitState: Play,
  PerformAction: Play,
  Satisfy: CheckSquare,
  Assert: ShieldCheck,
  Binding: Link2,
  Succession: Repeat,
  Reference: Link2,
  Definition: Box,
  Usage: Component,
  Namespace: Package,
  Element: FileCode,
  Send: Send,
};

function getIcon(type: string): LucideIcon {
  return ICON_MAP[type] ?? FileCode;
}

/* ------------------------------------------------------------------ */
/*  Colour palette per category / type                                */
/* ------------------------------------------------------------------ */

interface StylePalette {
  /** Header background */
  header: string;
  /** Header text */
  headerText: string;
  /** Border accent */
  border: string;
  /** Accent dot colour (for the indicator) */
  accent: string;
}

function getStylePalette(type: string): StylePalette {
  switch (type) {
    case 'Package':
      return {
        header: 'bg-slate-100 dark:bg-slate-800/60',
        headerText: 'text-slate-700 dark:text-slate-300',
        border: 'border-slate-300 dark:border-slate-600',
        accent: 'bg-slate-500',
      };
    case 'Block':
      return {
        header: 'bg-blue-600 dark:bg-blue-700',
        headerText: 'text-white',
        border: 'border-blue-500 dark:border-blue-600',
        accent: 'bg-blue-500',
      };
    case 'Part':
      return {
        header: 'bg-indigo-600 dark:bg-indigo-700',
        headerText: 'text-white',
        border: 'border-indigo-500 dark:border-indigo-600',
        accent: 'bg-indigo-500',
      };
    case 'Port':
      return {
        header: 'bg-teal-600 dark:bg-teal-700',
        headerText: 'text-white',
        border: 'border-teal-500 dark:border-teal-600',
        accent: 'bg-teal-500',
      };
    case 'Interface':
      return {
        header: 'bg-violet-600 dark:bg-violet-700',
        headerText: 'text-white',
        border: 'border-violet-500 dark:border-violet-600',
        accent: 'bg-violet-500',
      };
    case 'Allocation':
      return {
        header: 'bg-cyan-600 dark:bg-cyan-700',
        headerText: 'text-white',
        border: 'border-cyan-500 dark:border-cyan-600',
        accent: 'bg-cyan-500',
      };
    case 'Action':
    case 'PerformAction':
      return {
        header: 'bg-amber-500 dark:bg-amber-600',
        headerText: 'text-white',
        border: 'border-amber-500 dark:border-amber-600',
        accent: 'bg-amber-500',
      };
    case 'State':
    case 'ExhibitState':
    case 'Transition':
      return {
        header: 'bg-orange-500 dark:bg-orange-600',
        headerText: 'text-white',
        border: 'border-orange-500 dark:border-orange-600',
        accent: 'bg-orange-500',
      };
    case 'Calculation':
      return {
        header: 'bg-sky-600 dark:bg-sky-700',
        headerText: 'text-white',
        border: 'border-sky-500 dark:border-sky-600',
        accent: 'bg-sky-500',
      };
    case 'Requirement':
    case 'Concern':
    case 'Satisfy':
      return {
        header: 'bg-rose-600 dark:bg-rose-700',
        headerText: 'text-white',
        border: 'border-rose-500 dark:border-rose-600',
        accent: 'bg-rose-500',
      };
    case 'Constraint':
    case 'Assert':
      return {
        header: 'bg-red-600 dark:bg-red-700',
        headerText: 'text-white',
        border: 'border-red-500 dark:border-red-600',
        accent: 'bg-red-500',
      };
    case 'Case':
    case 'UseCase':
    case 'AnalysisCase':
    case 'VerificationCase':
      return {
        header: 'bg-emerald-600 dark:bg-emerald-700',
        headerText: 'text-white',
        border: 'border-emerald-500 dark:border-emerald-600',
        accent: 'bg-emerald-500',
      };
    case 'Item':
    case 'Enumeration':
      return {
        header: 'bg-fuchsia-600 dark:bg-fuchsia-700',
        headerText: 'text-white',
        border: 'border-fuchsia-500 dark:border-fuchsia-600',
        accent: 'bg-fuchsia-500',
      };
    case 'View':
    case 'Viewpoint':
    case 'Rendering':
      return {
        header: 'bg-lime-600 dark:bg-lime-700',
        headerText: 'text-white',
        border: 'border-lime-500 dark:border-lime-600',
        accent: 'bg-lime-500',
      };
    case 'Metadata':
      return {
        header: 'bg-gray-600 dark:bg-gray-700',
        headerText: 'text-white',
        border: 'border-gray-500 dark:border-gray-600',
        accent: 'bg-gray-500',
      };
    default:
      return {
        header: 'bg-slate-500 dark:bg-slate-600',
        headerText: 'text-white',
        border: 'border-slate-400 dark:border-slate-600',
        accent: 'bg-slate-500',
      };
  }
}

/* ------------------------------------------------------------------ */
/*  Status badge                                                      */
/* ------------------------------------------------------------------ */

const StatusBadge = ({ status }: { status?: string }) => {
  switch (status) {
    case 'Verified': return <span className="px-1.5 py-0.5 text-[8px] font-bold rounded bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">✓ Verified</span>;
    case 'Failed':   return <span className="px-1.5 py-0.5 text-[8px] font-bold rounded bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/30">✗ Failed</span>;
    case 'Review':   return <span className="px-1.5 py-0.5 text-[8px] font-bold rounded bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30">⏳ Review</span>;
    case 'Draft':    return <span className="px-1.5 py-0.5 text-[8px] font-bold rounded bg-slate-500/20 text-slate-500 dark:text-slate-400 border border-slate-500/30">Draft</span>;
    default:         return null;
  }
};

/* ------------------------------------------------------------------ */
/*  Component                                                         */
/* ------------------------------------------------------------------ */

export const SysMLNode = memo(({ data, selected }: NodeProps) => {
  const { label, type, kind, detail, properties, status, childCount } = data;
  const palette = getStylePalette(type);
  const Icon = getIcon(type);

  // Build the «stereotype» string from SysML detail (e.g. "part def" → «part def»)
  const stereotype = detail || type;

  return (
    <div className={cn(
      'flex flex-col bg-[var(--bg-input)] border rounded-lg shadow-lg min-w-[240px] max-w-[320px] transition-all overflow-hidden group',
      palette.border,
      selected
        ? 'ring-2 ring-blue-500 border-blue-500 z-50 scale-[1.02] shadow-blue-500/20'
        : 'hover:shadow-xl',
    )}>
      {/* Top handle */}
      <Handle
        type="target"
        position={Position.Top}
        className="w-3 h-3 !bg-blue-500 !border-2 !border-white dark:!border-slate-900 !-top-1.5 transition-transform group-hover:scale-125"
      />

      {/* ── Header compartment ── */}
      <div className={cn('px-3 py-2.5 flex items-center justify-between gap-2', palette.header)}>
        <div className="flex items-center gap-2.5 min-w-0">
          <div className={cn('p-1 rounded', palette.headerText === 'text-white' ? 'bg-white/20' : 'bg-slate-200 dark:bg-slate-700')}>
            <Icon className={cn('w-3.5 h-3.5', palette.headerText)} />
          </div>
          <div className="flex flex-col min-w-0">
            <span className={cn('text-[8px] font-black uppercase tracking-[0.15em] leading-none mb-0.5 opacity-80', palette.headerText)}>
              «{stereotype}»
            </span>
            <div className={cn('font-bold text-xs font-mono tracking-tight truncate', palette.headerText)}>
              {label}
            </div>
          </div>
        </div>
        <StatusBadge status={status} />
      </div>

      {/* ── Attributes compartment ── */}
      {properties && Object.keys(properties).length > 0 && (
        <div className="border-t border-slate-200 dark:border-slate-700">
          <div className="px-3 py-1 bg-slate-50/60 dark:bg-slate-800/40 text-[8px] font-bold text-[var(--text-muted)] uppercase tracking-wider">
            Attributes
          </div>
          <div className="px-3 py-2 space-y-1">
            {Object.entries(properties).map(([key, val]) => (
              <div key={key} className="flex items-center gap-2 text-[10px] font-mono">
                <span className="text-[var(--text-muted)] truncate flex-1">{key}</span>
                {val && (
                  <>
                    <span className="text-[var(--text-muted)]">:</span>
                    <span className="text-[var(--text-main)] font-semibold bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700 truncate max-w-[120px]">
                      {String(val)}
                    </span>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Children indicator ── */}
      {childCount > 0 && (
        <div className="px-3 py-1.5 border-t border-slate-200 dark:border-slate-700 flex items-center gap-2 bg-blue-50/30 dark:bg-blue-900/10">
          <Layers size={10} className="text-blue-500" />
          <span className="text-[9px] font-bold text-blue-600 dark:text-blue-400">
            {childCount} nested element{childCount > 1 ? 's' : ''}
          </span>
        </div>
      )}

      {/* ── Footer ── */}
      <div className="px-3 py-1 bg-slate-50/30 dark:bg-slate-900/30 flex justify-between items-center border-t border-slate-100 dark:border-slate-800">
        <span className="text-[8px] text-[var(--text-muted)] font-mono truncate max-w-[160px]">
          {label.toLowerCase().replace(/\s+/g, '_')}
        </span>
        <div className={cn('w-2 h-2 rounded-full', palette.accent)} />
      </div>

      {/* Bottom handle */}
      <Handle
        type="source"
        position={Position.Bottom}
        className="w-3 h-3 !bg-blue-500 !border-2 !border-white dark:!border-slate-900 !-bottom-1.5 transition-transform group-hover:scale-125"
      />
    </div>
  );
});

SysMLNode.displayName = 'SysMLNode';
