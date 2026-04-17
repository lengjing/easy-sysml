import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Search, Settings, Box, FileText, Info, Layers, Table as TableIcon, Zap, Network, Activity, Package, Circle, Link2, Database, Calculator, ShieldCheck } from 'lucide-react';
import { TreeItem } from './TreeItem';
import { ContextMenu } from './ContextMenu';

interface SidebarLeftProps {
  visible: boolean;
  activeTab: string;
  onAddElement?: (type: string) => void;
  onDropElement?: (draggedId: string, targetId: string) => void;
  nodes: any[];
}

export const SidebarLeft = ({ visible, activeTab, onAddElement, onDropElement, nodes }: SidebarLeftProps) => {
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);

  if (!visible) return null;

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY });
  };

  const handleDrop = (draggedId: string, targetId: string) => {
    if (onDropElement) {
      onDropElement(draggedId, targetId);
    }
  };

  const renderContent = () => {
    if (activeTab === 'search') {
      return (
        <div className="p-4 flex flex-col gap-4">
          <div className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest">搜索结果</div>
          <div className="text-xs text-[var(--text-muted)] italic">输入关键字开始搜索模型元素...</div>
        </div>
      );
    }

    if (activeTab === 'database') {
      return (
        <div className="p-4 flex flex-col gap-4">
          <div className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest">模型库 (Repository)</div>
          <div className="space-y-2">
            <div className="p-2 rounded border border-[var(--border-color)] bg-[var(--bg-main)] hover:border-blue-500 cursor-pointer transition-all">
              <div className="text-xs font-medium">UAV_System_v1.2</div>
              <div className="text-[10px] text-[var(--text-muted)]">最后修改: 2小时前</div>
            </div>
            <div className="p-2 rounded border border-[var(--border-color)] bg-[var(--bg-main)] hover:border-blue-500 cursor-pointer transition-all opacity-60">
              <div className="text-xs font-medium">UAV_System_v1.1</div>
              <div className="text-[10px] text-[var(--text-muted)]">最后修改: 昨天</div>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="flex-1 overflow-y-auto p-2 custom-scrollbar">
        <div className="space-y-1">
          <TreeItem label="模型树 (Model Tree)" icon={Box} isOpen={true} onContextMenu={handleContextMenu}>
            {/* Packages */}
            <TreeItem id="package-root" label="包 (Packages)" icon={Package} isOpen={true} onContextMenu={handleContextMenu} onDrop={handleDrop}>
              {nodes.filter(n => n.data.type === 'Package' && !n.parentNode).map(n => (
                <TreeItem key={n.id} id={n.id} label={n.data.label} icon={Package} isLeaf={false} onContextMenu={handleContextMenu} onDrop={handleDrop}>
                   {nodes.filter(child => child.parentNode === n.id).map(child => (
                     <TreeItem key={child.id} id={child.id} label={child.data.label} icon={child.data.type === 'Package' ? Package : Box} isLeaf={child.data.type !== 'Package'} onContextMenu={handleContextMenu} onDrop={handleDrop} />
                   ))}
                </TreeItem>
              ))}
            </TreeItem>

            {/* Requirements */}
            <TreeItem id="req-root" label="需求与约束 (Req & Constraints)" icon={FileText} isOpen={true} onContextMenu={handleContextMenu} onDrop={handleDrop}>
              {nodes.filter(n => (n.data.type === 'Requirement' || n.data.type === 'Constraint') && !n.parentNode).map(n => (
                <TreeItem key={n.id} id={n.id} label={n.data.label} icon={n.data.type === 'Requirement' ? Info : ShieldCheck} isLeaf={false} onContextMenu={handleContextMenu} onDrop={handleDrop}>
                   {nodes.filter(child => child.parentNode === n.id).map(child => (
                     <TreeItem key={child.id} id={child.id} label={child.data.label} icon={Info} isLeaf onContextMenu={handleContextMenu} onDrop={handleDrop} />
                   ))}
                </TreeItem>
              ))}
              {/* Fallback */}
              {nodes.filter(n => n.data.type === 'Requirement' || n.data.type === 'Constraint').length === 0 && (
                <>
                  <TreeItem label="R01-自主避障" icon={Info} isLeaf onContextMenu={handleContextMenu} />
                  <TreeItem label="R02-续航能力" icon={Info} isLeaf onContextMenu={handleContextMenu} />
                </>
              )}
            </TreeItem>

            {/* Structure */}
            <TreeItem id="struct-root" label="结构 (Structure)" icon={Layers} isOpen={true} onContextMenu={handleContextMenu} onDrop={handleDrop}>
              {nodes.filter(n => ['Part', 'Port', 'Interface', 'Item', 'Attribute'].includes(n.data.type) && !n.parentNode).map(n => (
                <TreeItem key={n.id} id={n.id} label={n.data.label} icon={Box} isLeaf={false} onContextMenu={handleContextMenu} onDrop={handleDrop}>
                   {nodes.filter(child => child.parentNode === n.id).map(child => (
                     <TreeItem key={child.id} id={child.id} label={child.data.label} icon={Box} isLeaf onContextMenu={handleContextMenu} onDrop={handleDrop} />
                   ))}
                </TreeItem>
              ))}
              {/* Fallback */}
              {nodes.filter(n => ['Part', 'Port', 'Interface', 'Item', 'Attribute'].includes(n.data.type)).length === 0 && (
                <>
                  <TreeItem label="动力系统" icon={Box} isLeaf onContextMenu={handleContextMenu} />
                  <TreeItem label="飞控中心" icon={Box} isLeaf onContextMenu={handleContextMenu} />
                </>
              )}
            </TreeItem>

            {/* Behavior */}
            <TreeItem id="behavior-root" label="行为 (Behavior)" icon={Zap} isOpen={true} onContextMenu={handleContextMenu} onDrop={handleDrop}>
              {nodes.filter(n => ['Action', 'State', 'Calculation'].includes(n.data.type) && !n.parentNode).map(n => (
                <TreeItem key={n.id} id={n.id} label={n.data.label} icon={Zap} isLeaf={false} onContextMenu={handleContextMenu} onDrop={handleDrop}>
                   {nodes.filter(child => child.parentNode === n.id).map(child => (
                     <TreeItem key={child.id} id={child.id} label={child.data.label} icon={Zap} isLeaf onContextMenu={handleContextMenu} onDrop={handleDrop} />
                   ))}
                </TreeItem>
              ))}
            </TreeItem>
          </TreeItem>

          <div className="h-px bg-[var(--border-color)] my-2 mx-2" />

          <TreeItem label="图表列表 (Diagrams)" icon={TableIcon} isOpen={true} onContextMenu={handleContextMenu}>
            <TreeItem label="系统层级结构图 (BDD)" icon={Layers} isLeaf active onContextMenu={handleContextMenu} />
            <TreeItem label="内部块图 (IBD)" icon={Layers} isLeaf onContextMenu={handleContextMenu} />
            <TreeItem label="起飞流程 (ActD)" icon={Activity} isLeaf onContextMenu={handleContextMenu} />
          </TreeItem>

          <div className="h-px bg-[var(--border-color)] my-2 mx-2" />

          <TreeItem label="快捷模板 (Templates)" icon={Zap} onContextMenu={handleContextMenu}>
            <TreeItem label="标准块模板" icon={Box} isLeaf onContextMenu={handleContextMenu} />
            <TreeItem label="接口定义模板" icon={Network} isLeaf onContextMenu={handleContextMenu} />
            <TreeItem label="状态机模板" icon={Activity} isLeaf onContextMenu={handleContextMenu} />
          </TreeItem>
        </div>
      </div>
    );
  };

  return (
    <motion.aside 
      initial={{ width: 0, opacity: 0 }}
      animate={{ width: 280, opacity: 1 }}
      exit={{ width: 0, opacity: 0 }}
      className="border-r border-[var(--border-color)] bg-[var(--bg-sidebar)] flex flex-col overflow-hidden transition-colors duration-200"
    >
      <div className="p-3 border-b border-[var(--border-color)]">
        <div className="relative mb-3">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" size={14} />
          <input 
            type="text" 
            placeholder="搜索模型、图表..." 
            className="w-full bg-[var(--bg-main)] border border-[var(--border-color)] rounded-md pl-8 pr-3 py-1.5 text-xs focus:outline-none focus:border-blue-500 transition-all text-[var(--text-main)]"
          />
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest">
            {activeTab === 'search' ? '搜索' : activeTab === 'database' ? '模型库' : '模型浏览器'}
          </span>
          <div className="flex gap-1">
            <button className="p-1 hover:bg-[var(--border-color)] rounded text-[var(--text-muted)]" title="过滤"><Settings size={14} /></button>
          </div>
        </div>
      </div>

      {renderContent()}

      {contextMenu && (
        <ContextMenu 
          x={contextMenu.x} 
          y={contextMenu.y} 
          onClose={() => setContextMenu(null)}
          onAdd={(type) => onAddElement?.(type)}
        />
      )}
    </motion.aside>
  );
};
