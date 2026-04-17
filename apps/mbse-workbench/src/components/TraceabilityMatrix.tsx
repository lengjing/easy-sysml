import React from 'react';
import { Network } from 'lucide-react';

export const TraceabilityMatrix = () => {
  return (
    <div className="p-8 h-full overflow-auto custom-scrollbar">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold flex items-center gap-3">
            <Network className="text-blue-500" size={28} /> 全局追溯矩阵
          </h2>
          <div className="flex gap-2">
            <button className="px-3 py-1.5 bg-[var(--bg-sidebar)] border border-[var(--border-color)] rounded text-xs font-medium hover:bg-[var(--border-color)] transition-colors">导出 CSV</button>
            <button className="px-3 py-1.5 bg-blue-600 text-white rounded text-xs font-medium hover:bg-blue-500 transition-colors">新建追溯</button>
          </div>
        </div>
        <div className="bg-[var(--bg-sidebar)] border border-[var(--border-color)] rounded-xl overflow-hidden shadow-2xl transition-colors duration-200">
          <table className="w-full text-sm text-left border-collapse">
            <thead>
              <tr className="bg-[var(--bg-main)] border-b border-[var(--border-color)]">
                <th className="p-4 border-r border-[var(--border-color)] font-semibold text-[var(--text-muted)] uppercase tracking-wider text-[10px]">需求 \ 架构</th>
                <th className="p-4 border-r border-[var(--border-color)] font-semibold text-[var(--text-muted)] uppercase tracking-wider text-[10px]">动力系统</th>
                <th className="p-4 border-r border-[var(--border-color)] font-semibold text-[var(--text-muted)] uppercase tracking-wider text-[10px]">飞控中心</th>
                <th className="p-4 border-r border-[var(--border-color)] font-semibold text-[var(--text-muted)] uppercase tracking-wider text-[10px]">传感器组</th>
                <th className="p-4 font-semibold text-[var(--text-muted)] uppercase tracking-wider text-[10px]">通信模块</th>
              </tr>
            </thead>
            <tbody>
              {[
                { req: 'R01-自主避障', cells: [true, true, true, false] },
                { req: 'R02-续航能力', cells: [true, false, false, false] },
                { req: 'R03-实时传输', cells: [false, true, false, true] },
                { req: 'R04-载重指标', cells: [true, false, false, false] },
              ].map((row, i) => (
                <tr key={i} className="border-b border-[var(--border-color)] hover:bg-blue-500/5 transition-colors group">
                  <td className="p-4 border-r border-[var(--border-color)] font-medium bg-[var(--bg-main)] group-hover:text-blue-500 transition-colors">{row.req}</td>
                  {row.cells.map((cell, j) => (
                    <td key={j} className="p-4 border-r border-[var(--border-color)] text-center">
                      {cell ? (
                        <div className="inline-flex items-center justify-center px-2 py-1 rounded bg-blue-500/10 text-blue-500 border border-blue-500/20 text-[9px] font-bold tracking-tighter">
                          SATISFY
                        </div>
                      ) : (
                        <div className="w-1.5 h-1.5 rounded-full bg-[var(--border-color)] mx-auto" />
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
