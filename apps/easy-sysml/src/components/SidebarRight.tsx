import React from 'react';
import { motion } from 'motion/react';
import { CheckCircle2, AlertTriangle, Info } from 'lucide-react';
import { kindToKeyword } from './editor/sysml-domain-model';

interface SidebarRightProps {
  visible: boolean;
  /** Data from the currently selected canvas node, or null when nothing is selected. */
  selectedNode?: Record<string, unknown> | null;
}

/** Render a single labelled read-only field. */
const Field = ({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) => (
  <div className="group">
    <label className="block text-[10px] text-[var(--text-muted)] mb-1.5">{label}</label>
    <div className={`w-full bg-[var(--bg-main)] border border-[var(--border-color)] rounded px-3 py-2 text-xs text-[var(--text-main)] ${mono ? 'font-mono' : ''} break-all`}>
      {value}
    </div>
  </div>
);

export const SidebarRight = ({ visible, selectedNode }: SidebarRightProps) => {
  if (!visible) return null;

  const label    = typeof selectedNode?.label    === 'string' ? selectedNode.label    : '';
  const kind     = typeof selectedNode?.kind     === 'string' ? selectedNode.kind     : '';
  const detail   = typeof selectedNode?.detail   === 'string' ? selectedNode.detail   : '';
  const category = typeof selectedNode?.category === 'string' ? selectedNode.category : '';
  const status   = typeof selectedNode?.status   === 'string' ? selectedNode.status   : '';
  const nodeId   = typeof selectedNode?.id       === 'string' ? selectedNode.id       : '';

  const keyword    = (kind ? (kindToKeyword(kind) ?? detail) : detail) || '—';
  const properties = selectedNode?.properties as Record<string, string> | undefined ?? {};
  const propEntries = Object.entries(properties);

  return (
    <motion.aside 
      initial={{ width: 0, opacity: 0 }}
      animate={{ width: 320, opacity: 1 }}
      exit={{ width: 0, opacity: 0 }}
      className="border-l border-[var(--border-color)] bg-[var(--bg-sidebar)] flex flex-col overflow-hidden transition-colors duration-200"
    >
      <div className="flex border-b border-[var(--border-color)] bg-[var(--bg-main)]/50">
        <button className="flex-1 py-2.5 text-[11px] font-bold text-blue-500 border-b-2 border-blue-500 bg-blue-500/5">属性面板</button>
        <button className="flex-1 py-2.5 text-[11px] font-bold text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors">追溯关系</button>
        <button className="flex-1 py-2.5 text-[11px] font-bold text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors">约束验证</button>
      </div>
      
      <div className="flex-1 overflow-y-auto p-4 space-y-6 custom-scrollbar">
        {!selectedNode ? (
          /* ── No selection placeholder ── */
          <div className="flex flex-col items-center justify-center h-40 gap-3 text-[var(--text-muted)]">
            <Info size={28} className="opacity-30" />
            <p className="text-xs text-center">点击画布中的元素<br />查看其属性</p>
          </div>
        ) : (
          <>
            {/* ── Element identity ── */}
            <section>
              <h3 className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest mb-3">元素信息 (Element)</h3>
              <div className="space-y-3">
                {nodeId && <Field label="元素 ID" value={nodeId} mono />}
                <Field label="元素名称" value={label || '—'} />
                <Field label="类型 (Kind)" value={kind || '—'} mono />
                <Field label="SysML 关键字" value={keyword} mono />
                {category && <Field label="分类 (Category)" value={category} />}
                {status && <Field label="状态 (Status)" value={status} />}
              </div>
            </section>

            {/* ── Attributes ── */}
            {propEntries.length > 0 && (
              <section>
                <h3 className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest mb-3">属性 (Attributes)</h3>
                <div className="space-y-2">
                  {propEntries.map(([key, val]) => (
                    <div key={key} className="flex items-start gap-2 text-xs font-mono bg-[var(--bg-main)] border border-[var(--border-color)] rounded px-3 py-2">
                      <span className="text-[var(--text-muted)] shrink-0">{key}</span>
                      {val && (
                        <>
                          <span className="text-[var(--text-muted)]">:</span>
                          <span className="text-[var(--text-main)] break-all">{val}</span>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* ── Validation indicators ── */}
            <section>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest">验证状态 (Validation)</h3>
                <span className="px-2 py-0.5 rounded-full bg-green-500/10 text-green-500 text-[9px] font-bold border border-green-500/20">PASSED</span>
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
                  <CheckCircle2 size={14} className="text-green-500" />
                  <span>语法校验: 无错误</span>
                </div>
                {kind && (
                  <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
                    <CheckCircle2 size={14} className="text-green-500" />
                    <span>元素类型已识别</span>
                  </div>
                )}
                {!kind && (
                  <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
                    <AlertTriangle size={14} className="text-yellow-500" />
                    <span>元素类型未识别</span>
                  </div>
                )}
              </div>
            </section>
          </>
        )}
      </div>
    </motion.aside>
  );
};
