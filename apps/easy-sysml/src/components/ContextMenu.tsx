import React, { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Plus, 
  Trash2, 
  Edit3, 
  Package, 
  Box, 
  Settings, 
  Circle, 
  Link2, 
  Database, 
  Zap, 
  Activity, 
  Calculator, 
  FileText, 
  ShieldCheck, 
  Share2, 
  GitBranch 
} from 'lucide-react';

interface ContextMenuProps {
  x: number;
  y: number;
  onClose: () => void;
  onAdd: (type: string) => void;
}

const MenuSection = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <>
    <div className="px-2 py-1.5 text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider border-b border-[var(--border-color)] mb-1">
      {title}
    </div>
    {children}
  </>
);

const MenuItem = ({ 
  icon: Icon, 
  label, 
  onClick, 
  variant = 'default' 
}: { 
  icon: any; 
  label: string; 
  onClick?: () => void; 
  variant?: 'default' | 'danger' | 'disabled' 
}) => (
  <button
    onClick={onClick}
    disabled={variant === 'disabled'}
    className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs transition-colors ${
      variant === 'danger' 
        ? 'text-red-500 hover:bg-red-500 hover:text-white' 
        : variant === 'disabled'
        ? 'text-[var(--text-muted)] opacity-50 cursor-not-allowed'
        : 'text-[var(--text-main)] hover:bg-blue-500 hover:text-white'
    }`}
  >
    <Icon size={14} />
    <span>{label}</span>
  </button>
);

export const ContextMenu = ({ x, y, onClose, onAdd }: ContextMenuProps) => {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  const handleAdd = (type: string) => {
    onAdd(type);
    onClose();
  };

  return (
    <AnimatePresence>
      <motion.div
        ref={menuRef}
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        style={{ top: y, left: x }}
        className="fixed z-[100] bg-[var(--bg-sidebar)] border border-[var(--border-color)] rounded-lg shadow-2xl py-1 min-w-[200px] max-h-[80vh] overflow-y-auto custom-scrollbar"
      >
        <MenuSection title="结构 (Structure)">
          <MenuItem icon={Package} label="Package (包)" onClick={() => handleAdd('Package')} />
          <MenuItem icon={Box} label="Part (部件/块)" onClick={() => handleAdd('Part')} />
          <MenuItem icon={Settings} label="Attribute (属性)" onClick={() => handleAdd('Attribute')} />
          <MenuItem icon={Circle} label="Port (端口)" onClick={() => handleAdd('Port')} />
          <MenuItem icon={Link2} label="Interface (接口)" onClick={() => handleAdd('Interface')} />
          <MenuItem icon={Database} label="Item (项)" onClick={() => handleAdd('Item')} />
        </MenuSection>

        <MenuSection title="行为 (Behavior)">
          <MenuItem icon={Zap} label="Action (动作)" onClick={() => handleAdd('Action')} />
          <MenuItem icon={Activity} label="State (状态)" onClick={() => handleAdd('State')} />
          <MenuItem icon={Calculator} label="Calculation (计算)" onClick={() => handleAdd('Calculation')} />
        </MenuSection>

        <MenuSection title="约束与需求 (Constraint & Req)">
          <MenuItem icon={ShieldCheck} label="Constraint (约束)" onClick={() => handleAdd('Constraint')} />
          <MenuItem icon={FileText} label="Requirement (需求)" onClick={() => handleAdd('Requirement')} />
        </MenuSection>

        <MenuSection title="关系 (Relationship)">
          <MenuItem icon={Share2} label="Connection (连接)" onClick={() => handleAdd('Connection')} />
          <MenuItem icon={GitBranch} label="Allocation (分配)" onClick={() => handleAdd('Allocation')} />
          <MenuItem icon={GitBranch} label="Variation (变体)" onClick={() => handleAdd('Variation')} />
        </MenuSection>

        <div className="h-px bg-[var(--border-color)] my-1" />
        <MenuItem icon={Edit3} label="重命名 (F2)" variant="disabled" />
        <MenuItem icon={Trash2} label="删除 (Del)" variant="danger" />
      </motion.div>
    </AnimatePresence>
  );
};
