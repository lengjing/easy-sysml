import React, { useState } from 'react';
import { motion } from 'motion/react';
import {
  Search, Settings, Box, FileText, Info, Layers,
  Table as TableIcon, Zap, Network, Activity, Package,
  Circle, Link2, Database, ShieldCheck,
  Component, ArrowRightCircle, ShieldAlert, Target,
  Cpu, Eye, Inbox, CheckSquare,
} from 'lucide-react';
import { TreeItem } from './TreeItem';
import { ContextMenu } from './ContextMenu';
import type { DomainModel, DomainElement } from './editor/sysml-domain-model';
import type { SimpleElement } from './DiagramCanvas';

interface SidebarLeftProps {
  visible: boolean;
  activeTab: string;
  onAddElement?: (type: string) => void;
  onDropElement?: (draggedId: string, targetId: string) => void;
  nodes: SimpleElement[];
  domainModel?: DomainModel | null;
}

/* ------------------------------------------------------------------ */
/*  Icon mapping for tree items                                       */
/* ------------------------------------------------------------------ */

function iconForKind(kind: string) {
  switch (kind) {
    case 'Package':               return Package;
    case 'PartDefinition':        return Box;
    case 'PartUsage':             return Component;
    case 'AttributeDefinition':
    case 'AttributeUsage':        return Settings;
    case 'PortDefinition':
    case 'PortUsage':             return Circle;
    case 'InterfaceDefinition':
    case 'InterfaceUsage':
    case 'ConnectionDefinition':
    case 'ConnectionUsage':       return Link2;
    case 'ActionDefinition':
    case 'ActionUsage':           return ArrowRightCircle;
    case 'StateDefinition':
    case 'StateUsage':            return Activity;
    case 'CalculationDefinition':
    case 'CalculationUsage':      return Cpu;
    case 'ConstraintDefinition':
    case 'ConstraintUsage':       return ShieldAlert;
    case 'RequirementDefinition':
    case 'RequirementUsage':      return FileText;
    case 'ConcernDefinition':
    case 'ConcernUsage':          return Info;
    case 'CaseDefinition':
    case 'UseCaseDefinition':     return Target;
    case 'AnalysisCaseDefinition':return Activity;
    case 'VerificationCaseDefinition': return ShieldCheck;
    case 'ItemDefinition':
    case 'ItemUsage':             return Inbox;
    case 'EnumerationDefinition':
    case 'EnumerationUsage':      return Database;
    case 'ViewDefinition':
    case 'ViewpointDefinition':   return Eye;
    default:                      return Box;
  }
}

/* ------------------------------------------------------------------ */
/*  Recursive tree renderer for domain model elements                 */
/* ------------------------------------------------------------------ */

function DomainTreeItems({
  elements,
  onContextMenu,
  onDrop,
}: {
  elements: DomainElement[];
  onContextMenu: (e: React.MouseEvent) => void;
  onDrop: (draggedId: string, targetId: string) => void;
}) {
  return (
    <>
      {elements.map(el => {
        const Icon = iconForKind(el.kind);
        const isLeaf = el.children.length === 0;
        return (
          <TreeItem
            key={el.id}
            id={el.id}
            label={el.name}
            icon={Icon}
            isLeaf={isLeaf}
            isOpen={!isLeaf}
            onContextMenu={onContextMenu}
            onDrop={onDrop}
          >
            {!isLeaf && (
              <DomainTreeItems
                elements={el.children}
                onContextMenu={onContextMenu}
                onDrop={onDrop}
              />
            )}
          </TreeItem>
        );
      })}
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Component                                                         */
/* ------------------------------------------------------------------ */

export const SidebarLeft = ({
  visible,
  activeTab,
  onAddElement,
  onDropElement,
  nodes,
  domainModel,
}: SidebarLeftProps) => {
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

  /* -- Categorise elements from the domain model (LSP) -- */
  const allElements = domainModel?.elements ?? [];

  // Collect elements by category for the tree
  const packages = collectByCategory(allElements, 'package');
  const definitions = collectByCategory(allElements, 'definition');
  const usages = collectByCategory(allElements, 'usage');
  const requirements = collectByCategory(allElements, 'requirement');
  const constraints = collectByCategory(allElements, 'constraint');
  const behaviors = collectByCategory(allElements, 'behavior');

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

    // Main model tree — uses LSP domain model when available
    const hasDomainModel = allElements.length > 0;

    return (
      <div className="flex-1 overflow-y-auto p-2 custom-scrollbar">
        <div className="space-y-1">
          <TreeItem label="模型树 (Model Tree)" icon={Box} isOpen={true} onContextMenu={handleContextMenu}>

            {/* ── Packages ── */}
            <TreeItem id="package-root" label="包 (Packages)" icon={Package} isOpen={true} onContextMenu={handleContextMenu} onDrop={handleDrop}>
              {hasDomainModel ? (
                <DomainTreeItems elements={packages} onContextMenu={handleContextMenu} onDrop={handleDrop} />
              ) : (
                nodes.filter(n => n.type === 'Package' && !n.parentNode).map(n => (
                  <TreeItem key={n.id} id={n.id} label={n.label} icon={Package} isLeaf onContextMenu={handleContextMenu} onDrop={handleDrop} />
                ))
              )}
            </TreeItem>

            {/* ── Definitions ── */}
            <TreeItem id="def-root" label="定义 (Definitions)" icon={Layers} isOpen={true} onContextMenu={handleContextMenu} onDrop={handleDrop}>
              {hasDomainModel ? (
                <DomainTreeItems elements={definitions} onContextMenu={handleContextMenu} onDrop={handleDrop} />
              ) : (
                nodes.filter(n => ['Block', 'DataType'].includes(n.type) && !n.parentNode).map(n => (
                  <TreeItem key={n.id} id={n.id} label={n.label} icon={Box} isLeaf onContextMenu={handleContextMenu} onDrop={handleDrop} />
                ))
              )}
            </TreeItem>

            {/* ── Structure (Usages) ── */}
            <TreeItem id="struct-root" label="结构 (Structure)" icon={Layers} isOpen={true} onContextMenu={handleContextMenu} onDrop={handleDrop}>
              {hasDomainModel ? (
                <DomainTreeItems elements={usages} onContextMenu={handleContextMenu} onDrop={handleDrop} />
              ) : (
                nodes.filter(n => ['Part', 'Port', 'Interface', 'Item', 'Attribute'].includes(n.type) && !n.parentNode).map(n => (
                  <TreeItem key={n.id} id={n.id} label={n.label} icon={Component} isLeaf onContextMenu={handleContextMenu} onDrop={handleDrop} />
                ))
              )}
            </TreeItem>

            {/* ── Requirements & Constraints ── */}
            <TreeItem id="req-root" label="需求与约束 (Requirements)" icon={FileText} isOpen={true} onContextMenu={handleContextMenu} onDrop={handleDrop}>
              {hasDomainModel ? (
                <>
                  <DomainTreeItems elements={requirements} onContextMenu={handleContextMenu} onDrop={handleDrop} />
                  <DomainTreeItems elements={constraints} onContextMenu={handleContextMenu} onDrop={handleDrop} />
                </>
              ) : (
                nodes.filter(n => ['Requirement', 'Constraint'].includes(n.type) && !n.parentNode).map(n => (
                  <TreeItem key={n.id} id={n.id} label={n.label} icon={n.type === 'Requirement' ? Info : ShieldCheck} isLeaf onContextMenu={handleContextMenu} onDrop={handleDrop} />
                ))
              )}
            </TreeItem>

            {/* ── Behavior ── */}
            <TreeItem id="behavior-root" label="行为 (Behavior)" icon={Zap} isOpen={true} onContextMenu={handleContextMenu} onDrop={handleDrop}>
              {hasDomainModel ? (
                <DomainTreeItems elements={behaviors} onContextMenu={handleContextMenu} onDrop={handleDrop} />
              ) : (
                nodes.filter(n => ['Action', 'State', 'Calculation'].includes(n.type) && !n.parentNode).map(n => (
                  <TreeItem key={n.id} id={n.id} label={n.label} icon={Zap} isLeaf onContextMenu={handleContextMenu} onDrop={handleDrop} />
                ))
              )}
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

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

/**
 * Recursively collect top-level elements matching a given category.
 * When an element matches, it is included with its full subtree
 * (rendered by DomainTreeItems). We only recurse into non-matching
 * elements to "unwrap" containers like packages.
 */
function collectByCategory(elements: DomainElement[], category: string): DomainElement[] {
  const result: DomainElement[] = [];
  for (const el of elements) {
    if (el.category === category) {
      result.push(el);
    } else {
      result.push(...collectByCategory(el.children, category));
    }
  }
  return result;
}
