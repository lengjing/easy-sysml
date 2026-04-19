/**
 * SysML v2 Model Node Component
 *
 * Professional MBSE node rendering following SysML v2 / OMG notation:
 *
 *  ┌──────────────────────────────────────┐
 *  │ «stereotype»                         │
 *  │  ElementName                         │
 *  ├──────────────────────────────────────┤
 *  │  ◇ port1 : PortDef                  │
 *  ├──────────────────────────────────────┤
 *  │  attribute1 : Type                   │
 *  ├──────────────────────────────────────┤
 *  │  {constraint expression}             │
 *  ├──────────────────────────────────────┤
 *  │  ↳ 3 nested elements                │
 *  └──────────────────────────────────────┘
 *
 * Supports ALL SysML v2 element types with distinct visual styles,
 * ports, constraints, requirement text, and connection handles.
 */
import React, { memo } from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';
import {
  Box, Component, Database, Zap, Activity, Settings, Circle,
  Package, FileCode, ArrowRightCircle, ShieldCheck, ShieldAlert,
  Link2, FileText, Layers, Eye, Target, Cpu, GitBranch,
  Workflow, CheckSquare, LayoutGrid, Inbox, Repeat, Play, Send,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '../lib/utils';

/* ------------------------------------------------------------------ */
/*  Icon mapping                                                      */
/* ------------------------------------------------------------------ */

const ICON_MAP: Record<string, LucideIcon> = {
  Package, Block: Box, Part: Component, Attribute: Settings,
  Port: Circle, Interface: Link2, Allocation: LayoutGrid,
  Action: ArrowRightCircle, State: Circle, Calculation: Cpu,
  Constraint: ShieldAlert, Requirement: FileText, Concern: FileText,
  Case: CheckSquare, UseCase: Target, AnalysisCase: Activity,
  VerificationCase: ShieldCheck, Item: Inbox, Enumeration: Database,
  View: Eye, Viewpoint: Target, Rendering: Eye, Metadata: Database,
  Occurrence: Zap, Flow: GitBranch, Transition: Workflow,
  ExhibitState: Play, PerformAction: Play, Satisfy: CheckSquare,
  Assert: ShieldCheck, Binding: Link2, Succession: Repeat,
  Reference: Link2, Definition: Box, Usage: Component,
  Namespace: Package, Element: FileCode, Send: Send,
};

/* ------------------------------------------------------------------ */
/*  Colour palette                                                    */
/* ------------------------------------------------------------------ */

export interface StylePalette {
  header: string;
  headerText: string;
  border: string;
  accent: string;
}

export function getStylePalette(type: string): StylePalette {
  switch (type) {
    case 'Package':
      return { header: 'bg-slate-100 dark:bg-slate-800/60', headerText: 'text-slate-700 dark:text-slate-300', border: 'border-slate-300 dark:border-slate-600', accent: 'bg-slate-500' };
    case 'Block':
      return { header: 'bg-blue-600 dark:bg-blue-700', headerText: 'text-white', border: 'border-blue-500 dark:border-blue-600', accent: 'bg-blue-500' };
    case 'Part':
      return { header: 'bg-indigo-600 dark:bg-indigo-700', headerText: 'text-white', border: 'border-indigo-500 dark:border-indigo-600', accent: 'bg-indigo-500' };
    case 'Port':
      return { header: 'bg-teal-600 dark:bg-teal-700', headerText: 'text-white', border: 'border-teal-500 dark:border-teal-600', accent: 'bg-teal-500' };
    case 'Interface':
      return { header: 'bg-violet-600 dark:bg-violet-700', headerText: 'text-white', border: 'border-violet-500 dark:border-violet-600', accent: 'bg-violet-500' };
    case 'Allocation':
      return { header: 'bg-cyan-600 dark:bg-cyan-700', headerText: 'text-white', border: 'border-cyan-500 dark:border-cyan-600', accent: 'bg-cyan-500' };
    case 'Action': case 'PerformAction':
      return { header: 'bg-amber-500 dark:bg-amber-600', headerText: 'text-white', border: 'border-amber-500 dark:border-amber-600', accent: 'bg-amber-500' };
    case 'State': case 'ExhibitState': case 'Transition':
      return { header: 'bg-orange-500 dark:bg-orange-600', headerText: 'text-white', border: 'border-orange-500 dark:border-orange-600', accent: 'bg-orange-500' };
    case 'Calculation':
      return { header: 'bg-sky-600 dark:bg-sky-700', headerText: 'text-white', border: 'border-sky-500 dark:border-sky-600', accent: 'bg-sky-500' };
    case 'Requirement': case 'Concern': case 'Satisfy':
      return { header: 'bg-rose-600 dark:bg-rose-700', headerText: 'text-white', border: 'border-rose-500 dark:border-rose-600', accent: 'bg-rose-500' };
    case 'Constraint': case 'Assert':
      return { header: 'bg-red-600 dark:bg-red-700', headerText: 'text-white', border: 'border-red-500 dark:border-red-600', accent: 'bg-red-500' };
    case 'Case': case 'UseCase': case 'AnalysisCase': case 'VerificationCase':
      return { header: 'bg-emerald-600 dark:bg-emerald-700', headerText: 'text-white', border: 'border-emerald-500 dark:border-emerald-600', accent: 'bg-emerald-500' };
    case 'Item': case 'Enumeration':
      return { header: 'bg-fuchsia-600 dark:bg-fuchsia-700', headerText: 'text-white', border: 'border-fuchsia-500 dark:border-fuchsia-600', accent: 'bg-fuchsia-500' };
    case 'View': case 'Viewpoint': case 'Rendering':
      return { header: 'bg-lime-600 dark:bg-lime-700', headerText: 'text-white', border: 'border-lime-500 dark:border-lime-600', accent: 'bg-lime-500' };
    case 'Metadata':
      return { header: 'bg-gray-600 dark:bg-gray-700', headerText: 'text-white', border: 'border-gray-500 dark:border-gray-600', accent: 'bg-gray-500' };
    case 'Flow':
      return { header: 'bg-cyan-500 dark:bg-cyan-600', headerText: 'text-white', border: 'border-cyan-400 dark:border-cyan-500', accent: 'bg-cyan-500' };
    default:
      return { header: 'bg-slate-500 dark:bg-slate-600', headerText: 'text-white', border: 'border-slate-400 dark:border-slate-600', accent: 'bg-slate-500' };
  }
}

/* ------------------------------------------------------------------ */
/*  Status badge                                                      */
/* ------------------------------------------------------------------ */

const StatusBadge = ({ status }: { status?: string }) => {
  switch (status) {
    case 'Verified': return <span className="px-1.5 py-0.5 text-[8px] font-bold rounded bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">✓</span>;
    case 'Failed':   return <span className="px-1.5 py-0.5 text-[8px] font-bold rounded bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/30">✗</span>;
    case 'Review':   return <span className="px-1.5 py-0.5 text-[8px] font-bold rounded bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30">⏳</span>;
    case 'Draft':    return <span className="px-1.5 py-0.5 text-[8px] font-bold rounded bg-slate-500/20 text-slate-500 dark:text-slate-400 border border-slate-500/30">●</span>;
    default:         return null;
  }
};

/* ------------------------------------------------------------------ */
/*  Sub-compartments                                                  */
/* ------------------------------------------------------------------ */

export interface PortInfo { name: string; typeName?: string }

const PortCompartment = ({ ports }: { ports: PortInfo[] }) => {
  if (!ports.length) return null;
  return (
    <div className="border-t border-slate-200 dark:border-slate-700">
      <div className="px-3 py-0.5 bg-teal-50/60 dark:bg-teal-900/20 text-[8px] font-bold text-teal-700 dark:text-teal-400 uppercase tracking-wider">Ports</div>
      <div className="px-3 py-1 space-y-0.5">
        {ports.map((p, i) => (
          <div key={i} className="flex items-center gap-1.5 text-[10px] font-mono">
            <span className="w-2 h-2 border border-teal-500 bg-teal-100 dark:bg-teal-900 rotate-45 flex-shrink-0" />
            <span className="text-[var(--text-main)]">{p.name}</span>
            {p.typeName && <><span className="text-[var(--text-muted)]">:</span><span className="text-teal-600 dark:text-teal-400">{p.typeName}</span></>}
          </div>
        ))}
      </div>
    </div>
  );
};

const ConstraintCompartment = ({ constraints }: { constraints: string[] }) => {
  if (!constraints.length) return null;
  return (
    <div className="border-t border-slate-200 dark:border-slate-700">
      <div className="px-3 py-0.5 bg-red-50/60 dark:bg-red-900/20 text-[8px] font-bold text-red-700 dark:text-red-400 uppercase tracking-wider">Constraints</div>
      <div className="px-3 py-1 space-y-0.5">
        {constraints.map((c, i) => (
          <div key={i} className="text-[10px] font-mono text-red-600 dark:text-red-400">{'{'} {c} {'}'}</div>
        ))}
      </div>
    </div>
  );
};

const RequirementCompartment = ({ text, reqId }: { text?: string; reqId?: string }) => {
  if (!text && !reqId) return null;
  return (
    <div className="border-t border-slate-200 dark:border-slate-700">
      <div className="px-3 py-0.5 bg-rose-50/60 dark:bg-rose-900/20 text-[8px] font-bold text-rose-700 dark:text-rose-400 uppercase tracking-wider">Requirement</div>
      <div className="px-3 py-1 space-y-0.5">
        {reqId && <div className="text-[10px] font-mono text-[var(--text-muted)]">id = &quot;{reqId}&quot;</div>}
        {text && <div className="text-[10px] text-[var(--text-main)] italic line-clamp-3 leading-snug">{text}</div>}
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/*  Main component                                                    */
/* ------------------------------------------------------------------ */

export const SysMLNode = memo(({ data, selected }: NodeProps) => {
  const {
    label, type, detail, properties, status, childCount,
    description, ports, constraints, requirementText, requirementId,
  } = data;

  const palette = getStylePalette(type);
  const Icon = ICON_MAP[type] ?? FileCode;
  const stereotype = detail || type;

  return (
    <div className={cn(
      'flex flex-col bg-[var(--bg-input)] border-1 shadow-md min-w-[240px] max-w-[360px] transition-all overflow-hidden group',
      palette.border,
      selected ? 'ring-1 ring-blue-500 border-blue-500 z-50 shadow-blue-500/20' : 'hover:shadow-lg',
    )}>
      <Handle type="target" position={Position.Top} className="w-2.5 h-2.5 !bg-blue-500 !border-2 !border-white dark:!border-slate-900 !-top-1.5" />
      <Handle type="target" position={Position.Left} id="left" className="w-2.5 h-2.5 !bg-teal-500 !border-2 !border-white dark:!border-slate-900 !-left-1.5" />
      <Handle type="source" position={Position.Right} id="right" className="w-2.5 h-2.5 !bg-teal-500 !border-2 !border-white dark:!border-slate-900 !-right-1.5" />

      {/* Header */}
      <div className={cn('px-3 py-2 flex items-center justify-between gap-2', palette.header)}>
        <div className="flex items-center gap-2 min-w-0">
          <div className={cn('p-1 rounded', palette.headerText === 'text-white' ? 'bg-white/20' : 'bg-slate-200 dark:bg-slate-700')}>
            <Icon className={cn('w-3.5 h-3.5', palette.headerText)} />
          </div>
          <div className="flex flex-col min-w-0">
            <span className={cn('text-[8px] font-black uppercase tracking-[0.12em] leading-none mb-0.5 opacity-80', palette.headerText)}>
              «{stereotype}»
            </span>
            <div className={cn('font-bold text-xs font-mono tracking-tight truncate', palette.headerText)}>
              {label}
            </div>
          </div>
        </div>
        <StatusBadge status={status} />
      </div>

      {/* Description */}
      {description && (
        <div className="px-3 py-1 border-t border-slate-200 dark:border-slate-700 bg-yellow-50/40 dark:bg-yellow-900/10">
          <div className="text-[9px] text-[var(--text-muted)] italic line-clamp-2">{description}</div>
        </div>
      )}

      {/* Ports */}
      <PortCompartment ports={ports ?? []} />

      {/* Attributes */}
      {properties && Object.keys(properties).length > 0 && (
        <div className="border-t border-slate-200 dark:border-slate-700">
          <div className="px-3 py-0.5 bg-slate-50/60 dark:bg-slate-800/40 text-[8px] font-bold text-[var(--text-muted)] uppercase tracking-wider">Attributes</div>
          <div className="px-3 py-1 space-y-0.5">
            {Object.entries(properties).map(([key, val]) => (
              <div key={key} className="flex items-center gap-1.5 text-[10px] font-mono">
                <span className="text-[var(--text-muted)] truncate">{key}</span>
                {val ? (
                  <>
                    <span className="text-[var(--text-muted)]">:</span>
                    <span className="text-[var(--text-main)] font-semibold bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded border border-slate-200 dark:border-slate-700 truncate max-w-[140px]">{String(val)}</span>
                  </>
                ): null}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Constraints */}
      <ConstraintCompartment constraints={constraints ?? []} />

      {/* Requirement */}
      <RequirementCompartment text={requirementText} reqId={requirementId} />

      {/* Children indicator */}
      {childCount > 0 && (
        <div className="px-3 py-1 border-t border-slate-200 dark:border-slate-700 flex items-center gap-2 bg-blue-50/30 dark:bg-blue-900/10">
          <Layers size={10} className="text-blue-500" />
          <span className="text-[9px] font-bold text-blue-600 dark:text-blue-400">{childCount} nested element{childCount > 1 ? 's' : ''}</span>
        </div>
      )}

      {/* Footer */}
      <div className="px-3 py-1 bg-slate-50/30 dark:bg-slate-900/30 flex justify-between items-center border-t border-slate-100 dark:border-slate-800">
        <span className="text-[8px] text-[var(--text-muted)] font-mono truncate max-w-[200px]">{label.toLowerCase().replace(/\s+/g, '_')}</span>
        <div className={cn('w-2 h-2 rounded-full', palette.accent)} />
      </div>

      <Handle type="source" position={Position.Bottom} className="w-2.5 h-2.5 !bg-blue-500 !border-2 !border-white dark:!border-slate-900 !-bottom-1.5" />
    </div>
  );
});

SysMLNode.displayName = 'SysMLNode';
