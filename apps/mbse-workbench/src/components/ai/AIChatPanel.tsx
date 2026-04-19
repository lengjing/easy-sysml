/**
 * AI Chat Panel
 *
 * Agent-style conversational interface for SysML v2 modeling assistance.
 * Communicates with the Node.js backend server via streaming SSE.
 * Supports slash commands for quick editor integration.
 *
 * No API keys are needed in the frontend — the backend handles all
 * provider configuration via environment variables.
 */
import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  Sparkles, Send, Copy, Check, Plus, Loader2,
  MessageSquare, Code, AlertCircle, Brain, Terminal,
  FileCode, HelpCircle, Trash2,
} from 'lucide-react';
import { cn } from '../../lib/utils';

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

interface ThinkingStep {
  content: string;
  timestamp: number;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'error' | 'system';
  content: string;
  provider?: string;
  /** Extracted SysML code blocks (if any). */
  codeBlocks: string[];
  /** AI thinking steps shown during generation. */
  thinkingSteps: ThinkingStep[];
  /** Whether code was auto-applied to editor. */
  autoApplied?: boolean;
  timestamp: number;
}

interface AIChatPanelProps {
  /** Called when user clicks "Apply" on a code block — sets editor code. */
  onApplyCode: (code: string) => void;
  /** Current editor content — sent as context to the AI. */
  currentCode?: string;
}

interface BackendStatus {
  ok: boolean;
  provider: string;
  providerLabel: string;
  model: string;
  configured: boolean;
}

/* ------------------------------------------------------------------ */
/*  Slash commands                                                    */
/* ------------------------------------------------------------------ */

interface SlashCommand {
  name: string;
  label: string;
  description: string;
  icon: React.ReactNode;
}

const SLASH_COMMANDS: SlashCommand[] = [
  { name: '/code',  label: '/code',  description: '将当前编辑器代码附加为上下文', icon: <FileCode size={12} /> },
  { name: '/help',  label: '/help',  description: '显示可用命令列表',           icon: <HelpCircle size={12} /> },
  { name: '/clear', label: '/clear', description: '清空对话记录',               icon: <Trash2 size={12} /> },
];

/* ------------------------------------------------------------------ */
/*  Quick-prompt suggestions                                          */
/* ------------------------------------------------------------------ */

const QUICK_PROMPTS = [
  { label: '创建无人机系统', prompt: '帮我创建一个无人机系统模型，包含飞行控制、电力、通信子系统，每个子系统有属性和端口。' },
  { label: '添加需求定义', prompt: '帮我创建一个需求定义，包含最大飞行高度、最大速度和续航时间的需求。' },
  { label: '创建状态机', prompt: '帮我创建一个无人机飞行状态机，包含待机、起飞、巡航、降落、紧急着陆状态，以及状态之间的转换。' },
  { label: '定义接口', prompt: '帮我定义通信接口和数据流，包含遥控信号输入端口和遥测数据输出端口。' },
];

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

let _nextId = 0;
function makeId(): string {
  return `msg-${Date.now()}-${_nextId++}`;
}

/** Extract ```sysml ... ``` or ```...``` code blocks from markdown text. */
function extractCodeBlocks(text: string): string[] {
  const blocks: string[] = [];
  const regex = /```(?:sysml|kerml)?\s*\n([\s\S]*?)```/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    blocks.push(match[1].trim());
  }
  return blocks;
}

/* ------------------------------------------------------------------ */
/*  Component                                                         */
/* ------------------------------------------------------------------ */

export const AIChatPanel: React.FC<AIChatPanelProps> = ({
  onApplyCode,
  currentCode,
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [thinkingSteps, setThinkingSteps] = useState<ThinkingStep[]>([]);
  const [showCommands, setShowCommands] = useState(false);
  const [backendStatus, setBackendStatus] = useState<BackendStatus | null>(null);
  const [backendError, setBackendError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  /* ---------- Check backend status on mount ---------- */
  useEffect(() => {
    fetch('/api/status')
      .then(r => r.json())
      .then((data: BackendStatus) => {
        setBackendStatus(data);
        if (!data.configured) {
          setBackendError('后端 API Key 未配置，请设置环境变量后重启服务');
        }
      })
      .catch(() => {
        setBackendError('无法连接 AI 后端服务，请先启动: pnpm dev:server');
      });
  }, []);

  const aiAvailable = backendStatus?.configured ?? false;

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading, thinkingSteps]);

  /* ---------- Slash command handling ---------- */
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setInput(value);
    setShowCommands(value === '/');
  }, []);

  const executeCommand = useCallback((cmd: string) => {
    setShowCommands(false);

    switch (cmd) {
      case '/code': {
        if (currentCode?.trim()) {
          const sysMsg: ChatMessage = {
            id: makeId(),
            role: 'system',
            content: `\u{1F4CE} 已附加当前编辑器代码 (${currentCode.split('\n').length} 行) 作为上下文`,
            codeBlocks: [],
            thinkingSteps: [],
            timestamp: Date.now(),
          };
          setMessages(prev => [...prev, sysMsg]);
        } else {
          const sysMsg: ChatMessage = {
            id: makeId(),
            role: 'system',
            content: '\u26A0\uFE0F 编辑器中没有代码，请先在编辑器中编写 SysML v2 代码',
            codeBlocks: [],
            thinkingSteps: [],
            timestamp: Date.now(),
          };
          setMessages(prev => [...prev, sysMsg]);
        }
        setInput('');
        break;
      }
      case '/help': {
        const helpText = SLASH_COMMANDS.map(c => `**${c.label}** \u2014 ${c.description}`).join('\n');
        const sysMsg: ChatMessage = {
          id: makeId(),
          role: 'system',
          content: `\u{1F4CB} 可用命令:\n${helpText}`,
          codeBlocks: [],
          thinkingSteps: [],
          timestamp: Date.now(),
        };
        setMessages(prev => [...prev, sysMsg]);
        setInput('');
        break;
      }
      case '/clear':
        setMessages([]);
        setInput('');
        break;
    }
  }, [currentCode]);

  /* ---------- Send message via backend SSE ---------- */
  const handleSend = useCallback(async (text?: string) => {
    const userText = (text ?? input).trim();
    if (!userText || loading) return;

    // Handle slash commands
    if (userText.startsWith('/')) {
      const cmd = userText.split(' ')[0].toLowerCase();
      const matched = SLASH_COMMANDS.find(c => c.name === cmd);
      if (matched) {
        executeCommand(cmd);
        return;
      }
    }

    if (!aiAvailable) return;

    setInput('');
    setShowCommands(false);

    const userMsg: ChatMessage = {
      id: makeId(),
      role: 'user',
      content: userText,
      codeBlocks: [],
      thinkingSteps: [],
      timestamp: Date.now(),
    };
    setMessages(prev => [...prev, userMsg]);
    setLoading(true);
    setThinkingSteps([]);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      // Build conversation history for the backend
      const history = messages
        .filter(m => m.role === 'user' || m.role === 'assistant')
        .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }));
      history.push({ role: 'user', content: userText });

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: history,
          currentCode: currentCode?.trim() || undefined,
          autoApply: true,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: `请求失败 (${response.status})` }));
        throw new Error((err as { error?: string }).error || `请求失败 (${response.status})`);
      }

      // Parse SSE stream
      const reader = response.body?.getReader();
      if (!reader) throw new Error('无法读取响应流');

      const decoder = new TextDecoder();
      let buffer = '';
      const steps: ThinkingStep[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        let currentEvent = '';
        for (const line of lines) {
          if (line.startsWith('event: ')) {
            currentEvent = line.slice(7).trim();
          } else if (line.startsWith('data: ') && currentEvent) {
            try {
              const data = JSON.parse(line.slice(6));
              switch (currentEvent) {
                case 'thinking': {
                  const step: ThinkingStep = { content: data.content, timestamp: Date.now() };
                  steps.push(step);
                  setThinkingSteps([...steps]);
                  break;
                }
                case 'response': {
                  const codeBlocks = data.codeBlocks ?? extractCodeBlocks(data.content ?? '');
                  const assistantMsg: ChatMessage = {
                    id: makeId(),
                    role: 'assistant',
                    content: data.content,
                    provider: data.provider,
                    codeBlocks,
                    thinkingSteps: [...steps],
                    autoApplied: data.autoApply,
                    timestamp: Date.now(),
                  };
                  setMessages(prev => [...prev, assistantMsg]);

                  // Auto-apply first code block to editor
                  if (data.autoApply && codeBlocks.length > 0) {
                    onApplyCode(codeBlocks[0]);
                  }
                  break;
                }
                case 'error': {
                  const errorMsg: ChatMessage = {
                    id: makeId(),
                    role: 'error',
                    content: data.content,
                    codeBlocks: [],
                    thinkingSteps: [...steps],
                    timestamp: Date.now(),
                  };
                  setMessages(prev => [...prev, errorMsg]);
                  break;
                }
                case 'done':
                  break;
              }
            } catch {
              // skip malformed data lines
            }
            currentEvent = '';
          }
        }
      }
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      const message = err instanceof Error ? err.message : '生成失败，请稍后重试。';
      const errorMsg: ChatMessage = {
        id: makeId(),
        role: 'error',
        content: message,
        codeBlocks: [],
        thinkingSteps: [],
        timestamp: Date.now(),
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setLoading(false);
      setThinkingSteps([]);
      abortRef.current = null;
    }
  }, [aiAvailable, currentCode, executeCommand, input, loading, messages, onApplyCode]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  const handleCopy = useCallback((code: string, blockId: string) => {
    navigator.clipboard.writeText(code);
    setCopiedId(blockId);
    setTimeout(() => setCopiedId(null), 2000);
  }, []);

  const handleNewChat = useCallback(() => {
    setMessages([]);
    setInput('');
    setThinkingSteps([]);
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
  }, []);

  /* ---------------------------------------------------------------- */
  /*  Render                                                          */
  /* ---------------------------------------------------------------- */

  return (
    <div className="flex flex-col h-full bg-[var(--bg-sidebar)]">
      {/* Header */}
      <div className="h-10 border-b border-[var(--border-color)] flex items-center justify-between px-3 bg-[var(--bg-header)]/50 flex-shrink-0">
        <div className="flex items-center gap-2">
          <Sparkles size={14} className="text-purple-500" />
          <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider">
            AI 建模助手
          </span>
        </div>
        <div className="flex items-center gap-1">
          {backendStatus && (
            <span className="px-2 py-1 rounded border border-[var(--border-color)] text-[9px] font-bold text-[var(--text-muted)]">
              {backendStatus.providerLabel}
            </span>
          )}
          <button
            onClick={handleNewChat}
            className="p-1 hover:bg-[var(--border-color)] rounded text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors"
            title="新对话"
          >
            <Plus size={14} />
          </button>
        </div>
      </div>

      {/* Backend error banner */}
      {backendError && (
        <div className="border-b border-[var(--border-color)] p-2 bg-amber-500/10">
          <div className="flex items-center gap-1.5 px-2 py-1.5">
            <AlertCircle size={12} className="text-amber-500 flex-shrink-0" />
            <span className="text-[10px] text-amber-600 dark:text-amber-400">
              {backendError}
            </span>
          </div>
        </div>
      )}

      {/* Messages area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto custom-scrollbar">
        {messages.length === 0 ? (
          /* Empty state with quick-prompt cards */
          <div className="p-4 flex flex-col gap-4">
            <div className="text-center py-8">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-purple-500/10 mb-3">
                <Sparkles size={24} className="text-purple-500" />
              </div>
              <h3 className="text-sm font-bold text-[var(--text-main)] mb-1">AI 建模助手</h3>
              <p className="text-[11px] text-[var(--text-muted)] max-w-[220px] mx-auto leading-relaxed">
                Agent 驱动的专业 SysML v2 建模工具
              </p>
              <p className="text-[10px] text-[var(--text-muted)] mt-2">
                输入 <code className="px-1 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-purple-600 dark:text-purple-400 text-[9px] font-mono">/</code> 查看可用命令
              </p>
            </div>
            <div className="space-y-2">
              <div className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider px-1">
                快速开始
              </div>
              {QUICK_PROMPTS.map((qp, i) => (
                <button
                  key={i}
                  onClick={() => handleSend(qp.prompt)}
                  disabled={loading || !aiAvailable}
                  className="w-full text-left p-2.5 rounded-lg border border-[var(--border-color)] bg-[var(--bg-main)] hover:border-purple-500/50 hover:bg-purple-500/5 transition-all group disabled:opacity-50"
                >
                  <div className="flex items-center gap-2">
                    <MessageSquare size={12} className="text-purple-500 flex-shrink-0" />
                    <span className="text-[11px] font-medium text-[var(--text-main)] group-hover:text-purple-600 dark:group-hover:text-purple-400">
                      {qp.label}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        ) : (
          /* Message list */
          <div className="p-3 space-y-3">
            {messages.map(msg => (
              <div key={msg.id}>
                {/* Thinking steps (collapsed) */}
                {msg.thinkingSteps.length > 0 && (
                  <details className="mb-2 group/think">
                    <summary className="flex items-center gap-1.5 cursor-pointer text-[10px] text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors select-none">
                      <Brain size={10} className="text-purple-500" />
                      <span className="font-medium">思考过程 ({msg.thinkingSteps.length} 步)</span>
                    </summary>
                    <div className="mt-1 ml-4 space-y-1 border-l-2 border-purple-500/20 pl-2">
                      {msg.thinkingSteps.map((step, si) => (
                        <div key={si} className="flex items-start gap-1.5 text-[9px] text-[var(--text-muted)]">
                          <Terminal size={8} className="text-purple-400 mt-0.5 flex-shrink-0" />
                          <span>{step.content}</span>
                        </div>
                      ))}
                    </div>
                  </details>
                )}

                <div className={cn(
                  'rounded-lg p-3',
                  msg.role === 'user'
                    ? 'bg-blue-500/10 border border-blue-500/20 ml-4'
                    : msg.role === 'error'
                      ? 'bg-red-500/10 border border-red-500/20'
                      : msg.role === 'system'
                        ? 'bg-slate-500/5 border border-[var(--border-color)]'
                        : 'bg-[var(--bg-main)] border border-[var(--border-color)]',
                )}>
                  {/* Role label */}
                  <div className="flex items-center gap-1.5 mb-1.5">
                    {msg.role === 'user' ? (
                      <span className="text-[9px] font-bold text-blue-500 uppercase">您</span>
                    ) : msg.role === 'error' ? (
                      <>
                        <AlertCircle size={10} className="text-red-500" />
                        <span className="text-[9px] font-bold text-red-500 uppercase">错误</span>
                      </>
                    ) : msg.role === 'system' ? (
                      <>
                        <Terminal size={10} className="text-[var(--text-muted)]" />
                        <span className="text-[9px] font-bold text-[var(--text-muted)] uppercase">系统</span>
                      </>
                    ) : (
                      <>
                        <Sparkles size={10} className="text-purple-500" />
                        <span className="text-[9px] font-bold text-purple-500 uppercase">
                          {msg.provider || 'AI'}
                        </span>
                        {msg.autoApplied && (
                          <span className="text-[8px] px-1 py-0.5 rounded bg-green-500/10 text-green-600 dark:text-green-400 border border-green-500/20 font-medium">
                            已同步
                          </span>
                        )}
                      </>
                    )}
                  </div>

                  {/* Text content (render non-code parts) */}
                  <div className="text-[11px] text-[var(--text-main)] leading-relaxed whitespace-pre-wrap break-words">
                    {renderContent(msg.content)}
                  </div>

                  {/* Code blocks with Apply / Copy buttons */}
                  {msg.codeBlocks.map((code, ci) => {
                    const blockId = `${msg.id}-${ci}`;
                    return (
                      <div key={ci} className="mt-2 rounded border border-[var(--border-color)] overflow-hidden">
                        <div className="flex items-center justify-between px-2 py-1 bg-slate-100 dark:bg-slate-800 border-b border-[var(--border-color)]">
                          <div className="flex items-center gap-1.5">
                            <Code size={10} className="text-[var(--text-muted)]" />
                            <span className="text-[9px] font-bold text-[var(--text-muted)] uppercase">SysML v2</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => handleCopy(code, blockId)}
                              className="flex items-center gap-1 px-1.5 py-0.5 text-[9px] font-medium text-[var(--text-muted)] hover:text-[var(--text-main)] rounded hover:bg-[var(--border-color)] transition-colors"
                              title="复制代码"
                            >
                              {copiedId === blockId ? <Check size={10} className="text-green-500" /> : <Copy size={10} />}
                              {copiedId === blockId ? '已复制' : '复制'}
                            </button>
                            <button
                              onClick={() => onApplyCode(code)}
                              className="flex items-center gap-1 px-1.5 py-0.5 text-[9px] font-bold text-purple-600 dark:text-purple-400 bg-purple-500/10 hover:bg-purple-500/20 rounded transition-colors"
                              title="应用到编辑器"
                            >
                              <Sparkles size={10} />
                              应用
                            </button>
                          </div>
                        </div>
                        <pre className="p-2 text-[10px] font-mono text-[var(--text-main)] bg-[var(--bg-main)] overflow-x-auto leading-relaxed max-h-[300px] overflow-y-auto custom-scrollbar">
                          {code}
                        </pre>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}

            {/* Active thinking indicator */}
            {loading && (
              <div className="space-y-2">
                {thinkingSteps.length > 0 && (
                  <div className="ml-2 space-y-1 border-l-2 border-purple-500/30 pl-2">
                    {thinkingSteps.map((step, si) => (
                      <div key={si} className="flex items-start gap-1.5 text-[9px] text-[var(--text-muted)]">
                        <Brain size={8} className="text-purple-400 mt-0.5 flex-shrink-0" />
                        <span>{step.content}</span>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex items-center gap-2 p-3 rounded-lg bg-[var(--bg-main)] border border-[var(--border-color)]">
                  <Loader2 size={14} className="text-purple-500 animate-spin" />
                  <span className="text-[11px] text-[var(--text-muted)]">
                    {backendStatus?.providerLabel || 'AI'} 正在生成...
                  </span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Slash command menu */}
      {showCommands && (
        <div className="border-t border-[var(--border-color)] bg-[var(--bg-main)] px-2 py-1">
          <div className="text-[9px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-1 px-1">
            可用命令
          </div>
          {SLASH_COMMANDS.map(cmd => (
            <button
              key={cmd.name}
              onClick={() => {
                executeCommand(cmd.name);
              }}
              className="w-full text-left px-2 py-1.5 rounded flex items-center gap-2 hover:bg-purple-500/10 transition-colors group"
            >
              <span className="text-purple-500">{cmd.icon}</span>
              <span className="text-[11px] font-mono font-bold text-[var(--text-main)]">{cmd.label}</span>
              <span className="text-[10px] text-[var(--text-muted)]">{cmd.description}</span>
            </button>
          ))}
        </div>
      )}

      {/* Input area */}
      <div className="border-t border-[var(--border-color)] p-2 flex-shrink-0">
        {!aiAvailable && !backendError && (
          <div className="mb-2 flex items-center gap-1.5 px-2 py-1.5 rounded bg-amber-500/10 border border-amber-500/20">
            <AlertCircle size={12} className="text-amber-500 flex-shrink-0" />
            <span className="text-[10px] text-amber-600 dark:text-amber-400">
              正在连接 AI 后端服务...
            </span>
          </div>
        )}
        <div className="flex items-end gap-1.5">
          <textarea
            ref={inputRef}
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder={aiAvailable ? '描述您想要的模型，输入 / 查看命令...' : '等待后端服务连接...'}
            disabled={loading}
            rows={1}
            className="flex-1 bg-[var(--bg-main)] border border-[var(--border-color)] rounded-lg px-3 py-2 text-[11px] focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500/20 transition-all resize-none text-[var(--text-main)] placeholder:text-[var(--text-muted)] disabled:opacity-50 min-h-[36px] max-h-[120px]"
            style={{ height: 'auto' }}
            onInput={(e) => {
              const t = e.currentTarget;
              t.style.height = 'auto';
              t.style.height = Math.min(t.scrollHeight, 120) + 'px';
            }}
          />
          <button
            onClick={() => handleSend()}
            disabled={loading || !input.trim()}
            className={cn(
              'p-2 rounded-lg transition-all flex-shrink-0',
              input.trim()
                ? 'bg-purple-500 text-white hover:bg-purple-600 shadow-sm'
                : 'bg-[var(--border-color)] text-[var(--text-muted)] cursor-not-allowed',
            )}
            title="发送"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
          </button>
        </div>
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/*  Markdown-lite renderer (strips code blocks, keeps text)           */
/* ------------------------------------------------------------------ */

function renderContent(text: string): React.ReactNode {
  // Remove code blocks (they are rendered separately)
  const cleaned = text.replace(/```(?:sysml|kerml)?\s*\n[\s\S]*?```/g, '').trim();
  if (!cleaned) return null;

  // Simple bold/inline-code rendering
  const parts = cleaned.split(/(\*\*.*?\*\*|`[^`]+`)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i} className="font-bold">{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return (
        <code key={i} className="px-1 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[10px] font-mono text-purple-600 dark:text-purple-400">
          {part.slice(1, -1)}
        </code>
      );
    }
    return part;
  });
}
