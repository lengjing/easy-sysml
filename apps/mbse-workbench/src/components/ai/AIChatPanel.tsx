/**
 * AI Chat Panel — Copilot-style Agent Interface
 *
 * Communicates with the separate AI agent server via SSE streaming.
 * - Streams markdown content token-by-token (rendered via react-markdown)
 * - Code blocks are NOT displayed in chat — they are auto-synced to editor
 * - Shows thinking steps and tool calls inline
 * - Supports slash commands: /code, /help, /clear
 */
import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import Markdown from 'react-markdown';
import {
  Sparkles, Send, Plus, Loader2,
  MessageSquare, AlertCircle, Brain, Terminal,
  FileCode, HelpCircle, Trash2, CheckCircle, Wrench,
  XCircle,
} from 'lucide-react';
import { cn } from '../../lib/utils';

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

interface ThinkingStep {
  content: string;
  timestamp: number;
}

interface ToolCall {
  name: string;
  status: 'running' | 'completed' | 'error';
  result?: string;
  timestamp: number;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'error' | 'system';
  content: string;
  provider?: string;
  thinkingSteps: ThinkingStep[];
  toolCalls: ToolCall[];
  /** Number of code blocks auto-synced to editor */
  codesSynced: number;
  timestamp: number;
}

interface AIChatPanelProps {
  onApplyCode: (code: string) => void;
  currentCode?: string;
}

interface BackendStatus {
  ok: boolean;
  provider: string;
  providerLabel: string;
  model: string;
  configured: boolean;
  tools?: string[];
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
  { name: '/code',  label: '/code',  description: '将编辑器代码附加为上下文', icon: <FileCode size={12} /> },
  { name: '/help',  label: '/help',  description: '显示可用命令',             icon: <HelpCircle size={12} /> },
  { name: '/clear', label: '/clear', description: '清空对话',                 icon: <Trash2 size={12} /> },
];

const QUICK_PROMPTS = [
  { label: '创建无人机系统', prompt: '帮我创建一个无人机系统模型，包含飞行控制、电力、通信子系统，每个子系统有属性和端口。' },
  { label: '添加需求定义', prompt: '帮我创建一个需求定义，包含最大飞行高度、最大速度和续航时间的需求。' },
  { label: '创建状态机', prompt: '帮我创建一个无人机飞行状态机，包含待机、起飞、巡航、降落、紧急着陆状态。' },
  { label: '定义接口', prompt: '帮我定义通信接口和数据流，包含遥控信号输入端口和遥测数据输出端口。' },
];

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

let _nextId = 0;
function makeId(): string {
  return `msg-${Date.now()}-${_nextId++}`;
}

/* ------------------------------------------------------------------ */
/*  Markdown components — custom renderers for react-markdown         */
/* ------------------------------------------------------------------ */

const markdownComponents = {
  p: ({ children, ...props }: React.HTMLAttributes<HTMLParagraphElement>) => (
    <p className="mb-2 last:mb-0" {...props}>{children}</p>
  ),
  strong: ({ children, ...props }: React.HTMLAttributes<HTMLElement>) => (
    <strong className="font-bold text-[var(--text-main)]" {...props}>{children}</strong>
  ),
  em: ({ children, ...props }: React.HTMLAttributes<HTMLElement>) => (
    <em className="italic" {...props}>{children}</em>
  ),
  code: ({ children, className, ...props }: React.HTMLAttributes<HTMLElement>) => {
    // Inline code only — block code is handled differently
    if (className?.includes('language-')) return null;
    return (
      <code className="px-1 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[10px] font-mono text-purple-600 dark:text-purple-400" {...props}>
        {children}
      </code>
    );
  },
  pre: () => null, // Block code is stripped — auto-synced to editor
  ul: ({ children, ...props }: React.HTMLAttributes<HTMLUListElement>) => (
    <ul className="list-disc pl-4 mb-2 space-y-0.5" {...props}>{children}</ul>
  ),
  ol: ({ children, ...props }: React.HTMLAttributes<HTMLOListElement>) => (
    <ol className="list-decimal pl-4 mb-2 space-y-0.5" {...props}>{children}</ol>
  ),
  li: ({ children, ...props }: React.HTMLAttributes<HTMLLIElement>) => (
    <li className="text-[11px]" {...props}>{children}</li>
  ),
  h1: ({ children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h1 className="text-sm font-bold mb-1 text-[var(--text-main)]" {...props}>{children}</h1>
  ),
  h2: ({ children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h2 className="text-[12px] font-bold mb-1 text-[var(--text-main)]" {...props}>{children}</h2>
  ),
  h3: ({ children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h3 className="text-[11px] font-bold mb-1 text-[var(--text-main)]" {...props}>{children}</h3>
  ),
  blockquote: ({ children, ...props }: React.HTMLAttributes<HTMLQuoteElement>) => (
    <blockquote className="border-l-2 border-purple-500/30 pl-2 my-1 text-[var(--text-muted)]" {...props}>{children}</blockquote>
  ),
};

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
  const [showCommands, setShowCommands] = useState(false);
  const [backendStatus, setBackendStatus] = useState<BackendStatus | null>(null);
  const [backendError, setBackendError] = useState<string | null>(null);

  // Streaming state
  const [streamingContent, setStreamingContent] = useState('');
  const [streamingThinking, setStreamingThinking] = useState<ThinkingStep[]>([]);
  const [streamingToolCalls, setStreamingToolCalls] = useState<ToolCall[]>([]);
  const [streamingCodeCount, setStreamingCodeCount] = useState(0);

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
          setBackendError('AI 后端 API Key 未配置，请在 ai-server 目录下配置 .env');
        }
      })
      .catch(() => {
        setBackendError('无法连接 AI 后端服务。请先在 apps/ai-server 目录下运行: pnpm dev');
      });
  }, []);

  const aiAvailable = backendStatus?.configured ?? false;

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading, streamingContent, streamingThinking, streamingToolCalls]);

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
            id: makeId(), role: 'system',
            content: `📎 已附加当前编辑器代码 (${currentCode.split('\n').length} 行) 作为上下文`,
            thinkingSteps: [], toolCalls: [], codesSynced: 0, timestamp: Date.now(),
          };
          setMessages(prev => [...prev, sysMsg]);
        } else {
          const sysMsg: ChatMessage = {
            id: makeId(), role: 'system',
            content: '⚠️ 编辑器中没有代码',
            thinkingSteps: [], toolCalls: [], codesSynced: 0, timestamp: Date.now(),
          };
          setMessages(prev => [...prev, sysMsg]);
        }
        setInput('');
        break;
      }
      case '/help': {
        const helpText = SLASH_COMMANDS.map(c => `**${c.label}** — ${c.description}`).join('\n');
        const sysMsg: ChatMessage = {
          id: makeId(), role: 'system',
          content: `📋 可用命令:\n${helpText}`,
          thinkingSteps: [], toolCalls: [], codesSynced: 0, timestamp: Date.now(),
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

  /* ---------- Send message via SSE streaming ---------- */
  const handleSend = useCallback(async (text?: string) => {
    const userText = (text ?? input).trim();
    if (!userText || loading) return;

    // Handle slash commands
    if (userText.startsWith('/')) {
      const cmd = userText.split(' ')[0].toLowerCase();
      const matched = SLASH_COMMANDS.find(c => c.name === cmd);
      if (matched) { executeCommand(cmd); return; }
    }

    if (!aiAvailable) return;

    setInput('');
    setShowCommands(false);

    const userMsg: ChatMessage = {
      id: makeId(), role: 'user', content: userText,
      thinkingSteps: [], toolCalls: [], codesSynced: 0, timestamp: Date.now(),
    };
    setMessages(prev => [...prev, userMsg]);
    setLoading(true);
    setStreamingContent('');
    setStreamingThinking([]);
    setStreamingToolCalls([]);
    setStreamingCodeCount(0);

    const controller = new AbortController();
    abortRef.current = controller;

    const thinkingAcc: ThinkingStep[] = [];
    const toolCallAcc: ToolCall[] = [];
    let contentAcc = '';
    let codeCount = 0;

    try {
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

      const reader = response.body?.getReader();
      if (!reader) throw new Error('无法读取响应流');

      const decoder = new TextDecoder();
      let buffer = '';

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
                  thinkingAcc.push(step);
                  setStreamingThinking([...thinkingAcc]);
                  break;
                }
                case 'delta': {
                  contentAcc += data.content;
                  setStreamingContent(contentAcc);
                  break;
                }
                case 'code': {
                  codeCount++;
                  setStreamingCodeCount(codeCount);
                  if (data.autoApply && data.content) {
                    onApplyCode(data.content);
                  }
                  break;
                }
                case 'tool_call': {
                  const tc: ToolCall = {
                    name: data.name,
                    status: data.status,
                    result: data.result,
                    timestamp: Date.now(),
                  };
                  // Update the most recent 'running' entry for this tool,
                  // or append if this is a new invocation
                  let existingIdx = -1;
                  if (data.status !== 'running') {
                    for (let i = toolCallAcc.length - 1; i >= 0; i--) {
                      if (toolCallAcc[i].name === data.name && toolCallAcc[i].status === 'running') {
                        existingIdx = i;
                        break;
                      }
                    }
                  }
                  if (existingIdx >= 0) {
                    toolCallAcc[existingIdx] = tc;
                  } else {
                    toolCallAcc.push(tc);
                  }
                  setStreamingToolCalls([...toolCallAcc]);
                  break;
                }
                case 'error': {
                  const errorMsg: ChatMessage = {
                    id: makeId(), role: 'error', content: data.content,
                    thinkingSteps: [...thinkingAcc], toolCalls: [...toolCallAcc],
                    codesSynced: codeCount, timestamp: Date.now(),
                  };
                  setMessages(prev => [...prev, errorMsg]);
                  break;
                }
                case 'done': {
                  if (contentAcc.trim() || codeCount > 0) {
                    const assistantMsg: ChatMessage = {
                      id: makeId(), role: 'assistant', content: contentAcc,
                      provider: backendStatus?.providerLabel,
                      thinkingSteps: [...thinkingAcc], toolCalls: [...toolCallAcc],
                      codesSynced: codeCount, timestamp: Date.now(),
                    };
                    setMessages(prev => [...prev, assistantMsg]);
                  }
                  break;
                }
              }
            } catch {
              // skip
            }
            currentEvent = '';
          }
        }
      }
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      const message = err instanceof Error ? err.message : '生成失败';
      const errorMsg: ChatMessage = {
        id: makeId(), role: 'error', content: message,
        thinkingSteps: [], toolCalls: [], codesSynced: 0, timestamp: Date.now(),
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setLoading(false);
      setStreamingContent('');
      setStreamingThinking([]);
      setStreamingToolCalls([]);
      setStreamingCodeCount(0);
      abortRef.current = null;
    }
  }, [aiAvailable, backendStatus, currentCode, executeCommand, input, loading, messages, onApplyCode]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  }, [handleSend]);

  const handleNewChat = useCallback(() => {
    setMessages([]);
    setInput('');
    setStreamingContent('');
    setStreamingThinking([]);
    setStreamingToolCalls([]);
    if (abortRef.current) { abortRef.current.abort(); abortRef.current = null; }
  }, []);

  const mdComponents = useMemo(() => markdownComponents, []);

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
            Copilot
          </span>
          {backendStatus?.tools && (
            <span className="text-[8px] px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 font-medium">
              Agent
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {backendStatus && (
            <span className="px-2 py-0.5 rounded border border-[var(--border-color)] text-[9px] font-medium text-[var(--text-muted)]">
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

      {/* Error banner */}
      {backendError && (
        <div className="border-b border-[var(--border-color)] p-2 bg-amber-500/10">
          <div className="flex items-center gap-1.5 px-2 py-1">
            <AlertCircle size={12} className="text-amber-500 flex-shrink-0" />
            <span className="text-[10px] text-amber-600 dark:text-amber-400">{backendError}</span>
          </div>
        </div>
      )}

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto custom-scrollbar">
        {messages.length === 0 && !loading ? (
          <div className="p-4 flex flex-col gap-4">
            <div className="text-center py-6">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-purple-500/10 mb-3">
                <Sparkles size={24} className="text-purple-500" />
              </div>
              <h3 className="text-sm font-bold text-[var(--text-main)] mb-1">SysML v2 Copilot</h3>
              <p className="text-[10px] text-[var(--text-muted)] max-w-[220px] mx-auto leading-relaxed">
                AI Agent 驱动 · 语法自动验证 · 代码直接同步编辑器
              </p>
              <p className="text-[9px] text-[var(--text-muted)] mt-2">
                输入 <code className="px-1 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-purple-600 dark:text-purple-400 text-[8px] font-mono">/</code> 查看命令
              </p>
            </div>
            <div className="space-y-1.5">
              <div className="text-[9px] font-bold text-[var(--text-muted)] uppercase tracking-wider px-1">快速开始</div>
              {QUICK_PROMPTS.map((qp, i) => (
                <button key={i} onClick={() => handleSend(qp.prompt)} disabled={loading || !aiAvailable}
                  className="w-full text-left p-2 rounded-lg border border-[var(--border-color)] bg-[var(--bg-main)] hover:border-purple-500/50 hover:bg-purple-500/5 transition-all group disabled:opacity-50">
                  <div className="flex items-center gap-2">
                    <MessageSquare size={11} className="text-purple-500 flex-shrink-0" />
                    <span className="text-[10px] font-medium text-[var(--text-main)] group-hover:text-purple-600 dark:group-hover:text-purple-400">{qp.label}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="p-3 space-y-3">
            {messages.map(msg => (
              <MessageBubble key={msg.id} msg={msg} mdComponents={mdComponents} />
            ))}

            {/* Streaming in-progress */}
            {loading && (
              <div className="space-y-2">
                {/* Thinking steps */}
                {streamingThinking.length > 0 && (
                  <div className="ml-1 space-y-0.5 border-l-2 border-purple-500/30 pl-2">
                    {streamingThinking.map((step, si) => (
                      <div key={si} className="flex items-start gap-1.5 text-[9px] text-[var(--text-muted)]">
                        <Brain size={8} className="text-purple-400 mt-0.5 flex-shrink-0" />
                        <span>{step.content}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Tool calls */}
                {streamingToolCalls.length > 0 && (
                  <div className="space-y-1">
                    {streamingToolCalls.map((tc, ti) => (
                      <div key={ti} className="flex items-center gap-1.5 px-2 py-1 rounded bg-[var(--bg-main)] border border-[var(--border-color)] text-[9px]">
                        <Wrench size={9} className={cn(
                          tc.status === 'running' ? 'text-blue-500 animate-spin' :
                          tc.status === 'completed' ? 'text-emerald-500' : 'text-red-500',
                        )} />
                        <span className="font-mono font-medium text-[var(--text-main)]">{tc.name}</span>
                        {tc.result && <span className="text-[var(--text-muted)] ml-auto truncate max-w-[150px]">{tc.result}</span>}
                      </div>
                    ))}
                  </div>
                )}

                {/* Streaming content */}
                {streamingContent ? (
                  <div className="rounded-lg p-3 bg-[var(--bg-main)] border border-[var(--border-color)]">
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <Sparkles size={10} className="text-purple-500" />
                      <span className="text-[9px] font-bold text-purple-500 uppercase">
                        {backendStatus?.providerLabel || 'AI'}
                      </span>
                      {streamingCodeCount > 0 && (
                        <span className="text-[8px] px-1 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 font-medium ml-auto">
                          {streamingCodeCount} 代码块已同步
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-[var(--text-main)] leading-relaxed prose-sm">
                      <Markdown components={mdComponents}>{streamingContent}</Markdown>
                      <span className="inline-block w-1.5 h-3.5 bg-purple-500 animate-pulse ml-0.5 -mb-0.5 rounded-sm" />
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-[var(--bg-main)] border border-[var(--border-color)]">
                    <Loader2 size={14} className="text-purple-500 animate-spin" />
                    <span className="text-[11px] text-[var(--text-muted)]">
                      {backendStatus?.providerLabel || 'AI'} 正在思考...
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Slash command popup */}
      {showCommands && (
        <div className="border-t border-[var(--border-color)] bg-[var(--bg-main)] px-2 py-1">
          <div className="text-[8px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-1 px-1">命令</div>
          {SLASH_COMMANDS.map(cmd => (
            <button key={cmd.name} onClick={() => executeCommand(cmd.name)}
              className="w-full text-left px-2 py-1 rounded flex items-center gap-2 hover:bg-purple-500/10 transition-colors">
              <span className="text-purple-500">{cmd.icon}</span>
              <span className="text-[10px] font-mono font-bold text-[var(--text-main)]">{cmd.label}</span>
              <span className="text-[9px] text-[var(--text-muted)]">{cmd.description}</span>
            </button>
          ))}
        </div>
      )}

      {/* Input area */}
      <div className="border-t border-[var(--border-color)] p-2 flex-shrink-0">
        {!aiAvailable && !backendError && (
          <div className="mb-2 flex items-center gap-1.5 px-2 py-1 rounded bg-amber-500/10 border border-amber-500/20">
            <AlertCircle size={11} className="text-amber-500 flex-shrink-0" />
            <span className="text-[9px] text-amber-600 dark:text-amber-400">正在连接 AI 后端...</span>
          </div>
        )}
        <div className="flex items-end gap-1.5">
          <textarea ref={inputRef} value={input} onChange={handleInputChange} onKeyDown={handleKeyDown}
            placeholder={aiAvailable ? '描述您想要的模型，输入 / 查看命令...' : '等待后端连接...'}
            disabled={loading} rows={1}
            className="flex-1 bg-[var(--bg-main)] border border-[var(--border-color)] rounded-lg px-3 py-2 text-[11px] focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500/20 transition-all resize-none text-[var(--text-main)] placeholder:text-[var(--text-muted)] disabled:opacity-50 min-h-[36px] max-h-[120px]"
            style={{ height: 'auto' }}
            onInput={(e) => { const t = e.currentTarget; t.style.height = 'auto'; t.style.height = Math.min(t.scrollHeight, 120) + 'px'; }}
          />
          <button onClick={() => handleSend()} disabled={loading || !input.trim()}
            className={cn('p-2 rounded-lg transition-all flex-shrink-0',
              input.trim() ? 'bg-purple-500 text-white hover:bg-purple-600 shadow-sm' : 'bg-[var(--border-color)] text-[var(--text-muted)] cursor-not-allowed')}
            title="发送">
            {loading ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
          </button>
        </div>
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/*  MessageBubble — renders a single completed message                */
/* ------------------------------------------------------------------ */

const MessageBubble: React.FC<{
  msg: ChatMessage;
  mdComponents: Record<string, React.FC<any>>;
}> = React.memo(({ msg, mdComponents }) => {
  return (
    <div>
      {/* Thinking (collapsed) */}
      {msg.thinkingSteps.length > 0 && (
        <details className="mb-1.5">
          <summary className="flex items-center gap-1.5 cursor-pointer text-[9px] text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors select-none">
            <Brain size={9} className="text-purple-500" />
            <span className="font-medium">思考过程 ({msg.thinkingSteps.length})</span>
          </summary>
          <div className="mt-1 ml-3 space-y-0.5 border-l-2 border-purple-500/20 pl-2">
            {msg.thinkingSteps.map((step, si) => (
              <div key={si} className="flex items-start gap-1 text-[8px] text-[var(--text-muted)]">
                <Terminal size={7} className="text-purple-400 mt-0.5 flex-shrink-0" />
                <span>{step.content}</span>
              </div>
            ))}
          </div>
        </details>
      )}

      {/* Tool calls */}
      {msg.toolCalls.length > 0 && (
        <div className="mb-1.5 space-y-0.5">
          {msg.toolCalls.map((tc, ti) => (
            <div key={ti} className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-[var(--bg-main)] border border-[var(--border-color)] text-[8px]">
              {tc.status === 'completed' ? <CheckCircle size={8} className="text-emerald-500 flex-shrink-0" /> :
               tc.status === 'error' ? <XCircle size={8} className="text-red-500 flex-shrink-0" /> :
               <Wrench size={8} className="text-blue-500 flex-shrink-0" />}
              <span className="font-mono font-medium text-[var(--text-main)]">{tc.name}</span>
              {tc.result && <span className="text-[var(--text-muted)] ml-auto truncate max-w-[150px]">{tc.result}</span>}
            </div>
          ))}
        </div>
      )}

      <div className={cn(
        'rounded-lg p-3',
        msg.role === 'user' ? 'bg-blue-500/10 border border-blue-500/20 ml-6'
          : msg.role === 'error' ? 'bg-red-500/10 border border-red-500/20'
          : msg.role === 'system' ? 'bg-slate-500/5 border border-[var(--border-color)]'
          : 'bg-[var(--bg-main)] border border-[var(--border-color)]',
      )}>
        {/* Role label */}
        <div className="flex items-center gap-1.5 mb-1">
          {msg.role === 'user' ? (
            <span className="text-[8px] font-bold text-blue-500 uppercase">You</span>
          ) : msg.role === 'error' ? (
            <><AlertCircle size={9} className="text-red-500" /><span className="text-[8px] font-bold text-red-500 uppercase">Error</span></>
          ) : msg.role === 'system' ? (
            <><Terminal size={9} className="text-[var(--text-muted)]" /><span className="text-[8px] font-bold text-[var(--text-muted)] uppercase">System</span></>
          ) : (
            <>
              <Sparkles size={9} className="text-purple-500" />
              <span className="text-[8px] font-bold text-purple-500 uppercase">{msg.provider || 'Copilot'}</span>
              {msg.codesSynced > 0 && (
                <span className="text-[7px] px-1 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 font-medium ml-auto flex items-center gap-0.5">
                  <CheckCircle size={7} /> {msg.codesSynced} 已同步
                </span>
              )}
            </>
          )}
        </div>

        {/* Content */}
        <div className="text-[11px] text-[var(--text-main)] leading-relaxed">
          {msg.role === 'user' || msg.role === 'system' || msg.role === 'error' ? (
            <span className="whitespace-pre-wrap break-words">{msg.content}</span>
          ) : (
            <Markdown components={mdComponents}>{msg.content}</Markdown>
          )}
        </div>
      </div>
    </div>
  );
});

MessageBubble.displayName = 'MessageBubble';
