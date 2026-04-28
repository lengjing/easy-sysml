import React from 'react';
import { motion } from 'motion/react';
import { CheckCircle2, AlertTriangle } from 'lucide-react';

interface SidebarRightProps {
  visible: boolean;
}

export const SidebarRight = ({ visible }: SidebarRightProps) => {
  if (!visible) return null;

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
      
      <div className="flex-1 overflow-y-auto p-4 space-y-8 custom-scrollbar">
        <section>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest">动态表单 (Properties)</h3>
            <button className="text-[10px] text-blue-500 hover:underline">重置</button>
          </div>
          <div className="space-y-4">
            <div className="group">
              <label className="block text-[10px] text-[var(--text-muted)] mb-1.5 group-focus-within:text-blue-500 transition-colors">元素 ID</label>
              <input 
                type="text" 
                readOnly
                defaultValue="UAV-SYS-001" 
                className="w-full bg-[var(--bg-main)] border border-[var(--border-color)] rounded px-3 py-2 text-xs text-[var(--text-muted)] font-mono opacity-60"
              />
            </div>
            <div className="group">
              <label className="block text-[10px] text-[var(--text-muted)] mb-1.5 group-focus-within:text-blue-500 transition-colors">元素名称</label>
              <input 
                type="text" 
                defaultValue="无人机系统架构" 
                className="w-full bg-[var(--bg-main)] border border-[var(--border-color)] rounded px-3 py-2 text-xs focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 transition-all text-[var(--text-main)]"
              />
            </div>
            <div className="group">
              <label className="block text-[10px] text-[var(--text-muted)] mb-1.5 group-focus-within:text-blue-500 transition-colors">描述</label>
              <textarea 
                rows={4}
                className="w-full bg-[var(--bg-main)] border border-[var(--border-color)] rounded px-3 py-2 text-xs focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 transition-all resize-none text-[var(--text-main)]"
                placeholder="输入模型描述..."
              />
            </div>
          </div>
        </section>

        <section>
          <h3 className="text-[10px] font-bold text-[var(--text-muted)] uppercase mb-4 tracking-widest">约束与参数 (Constraints)</h3>
          <div className="space-y-3">
            <div className="p-3 bg-[var(--bg-main)] border border-[var(--border-color)] rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-medium text-[var(--text-main)]">最大起飞重量</span>
                <span className="text-[10px] text-[var(--text-muted)]">ConstraintBlock</span>
              </div>
              <div className="flex items-center gap-2">
                <input type="number" defaultValue={25} className="w-16 bg-[var(--bg-sidebar)] border border-[var(--border-color)] rounded px-2 py-1 text-xs text-[var(--text-main)]" />
                <span className="text-xs text-[var(--text-muted)]">kg</span>
                <div className="flex-1 h-1.5 bg-[var(--border-color)] rounded-full overflow-hidden">
                  <div className="w-3/4 h-full bg-blue-500" />
                </div>
              </div>
            </div>
            <div className="p-3 bg-[var(--bg-main)] border border-[var(--border-color)] rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-medium text-[var(--text-main)]">续航里程</span>
                <span className="text-[10px] text-[var(--text-muted)]">Parametric</span>
              </div>
              <div className="flex items-center gap-2">
                <input type="number" defaultValue={150} className="w-16 bg-[var(--bg-sidebar)] border border-[var(--border-color)] rounded px-2 py-1 text-xs text-[var(--text-main)]" />
                <span className="text-xs text-[var(--text-muted)]">km</span>
                <div className="flex-1 h-1.5 bg-[var(--border-color)] rounded-full overflow-hidden">
                  <div className="w-1/2 h-full bg-purple-500" />
                </div>
              </div>
            </div>
          </div>
        </section>

        <section>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest">验证状态 (Validation)</h3>
            <span className="px-2 py-0.5 rounded-full bg-green-500/10 text-green-500 text-[9px] font-bold border border-green-500/20">PASSED</span>
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
              <CheckCircle2 size={14} className="text-green-500" />
              <span>语法校验: 无错误</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
              <CheckCircle2 size={14} className="text-green-500" />
              <span>连接完整性: 100%</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
              <AlertTriangle size={14} className="text-yellow-500" />
              <span>警告: 2个未定义的端口</span>
            </div>
          </div>
        </section>
      </div>
    </motion.aside>
  );
};
