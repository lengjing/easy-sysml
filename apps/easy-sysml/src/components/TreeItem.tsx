import React, { useState } from 'react';
import { motion } from 'motion/react';
import { ChevronRight } from 'lucide-react';
import { cn } from '../lib/utils';

interface TreeItemProps {
  id?: string;
  label: string;
  icon: any;
  isOpen?: boolean;
  isLeaf?: boolean;
  active?: boolean;
  children?: React.ReactNode;
  onContextMenu?: (e: React.MouseEvent) => void;
  onDrop?: (draggedId: string, targetId: string) => void;
}

export const TreeItem: React.FC<TreeItemProps> = ({ 
  id,
  label, 
  icon: Icon, 
  isOpen: initialIsOpen = false, 
  isLeaf = false, 
  active = false,
  children,
  onContextMenu,
  onDrop
}) => {
  const [isOpen, setIsOpen] = useState(initialIsOpen);
  const [isOver, setIsOver] = useState(false);

  const handleDragStart = (e: React.DragEvent) => {
    if (id) {
      e.dataTransfer.setData('text/plain', id);
      e.dataTransfer.effectAllowed = 'move';
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (!isLeaf) {
      setIsOver(true);
    }
  };

  const handleDragLeave = () => {
    setIsOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsOver(false);
    const draggedId = e.dataTransfer.getData('text/plain');
    if (draggedId && id && draggedId !== id && onDrop) {
      onDrop(draggedId, id);
    }
  };

  return (
    <div 
      className={cn("select-none", isOver && "bg-blue-500/10 rounded")}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div 
        draggable={!!id}
        onDragStart={handleDragStart}
        onClick={() => !isLeaf && setIsOpen(!isOpen)}
        onContextMenu={(e) => {
          if (onContextMenu) {
            e.preventDefault();
            onContextMenu(e);
          }
        }}
        className={cn(
          "flex items-center gap-2 py-1.5 px-2 rounded cursor-pointer transition-all group",
          active ? "bg-blue-600 text-white shadow-sm" : "hover:bg-[var(--border-color)] text-[var(--text-muted)] hover:text-[var(--text-main)]",
          isOver && "ring-1 ring-blue-500"
        )}
      >
        {!isLeaf ? (
          <motion.div animate={{ rotate: isOpen ? 90 : 0 }} transition={{ duration: 0.1 }}>
            <ChevronRight size={14} className={active ? "text-white" : "text-[var(--text-muted)]"} />
          </motion.div>
        ) : (
          <div className="w-3.5" />
        )}
        <Icon size={14} className={cn(active ? "text-white" : "text-[var(--text-muted)] group-hover:text-blue-500 transition-colors")} />
        <span className="text-[11px] font-medium truncate">{label}</span>
      </div>
      {!isLeaf && isOpen && (
        <div className="ml-3.5 border-l border-[var(--border-color)] pl-1.5 mt-0.5 space-y-0.5">
          {children}
        </div>
      )}
    </div>
  );
};
