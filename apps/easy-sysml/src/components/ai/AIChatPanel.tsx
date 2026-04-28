/**
 * AI Chat Panel — Copilot-style Agent Interface
 *
 * Communicates with sysml-server via SSE streaming, which proxies to free-code agent.
 * - Streams markdown content token-by-token (rendered via react-markdown)
 * - Auto-applies SysML code to editor when the agent writes a .sysml file
 * - Shows thinking steps, tool calls and file operations inline (Copilot-style)
 * - Supports slash commands: /code, /help, /clear
 * - Maintains conversation state (conversationId) for multi-turn sessions
 */
import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import Markdown from 'react-markdown';
import {
  Sparkles, Send, Plus, Loader2,
  MessageSquare, AlertCircle, Brain, Terminal,
  FileCode, HelpCircle, Trash2, CheckCircle, Wrench,
  XCircle, FileText, FilePen, Search, FolderOpen,
  Globe, Square, Clock, ChevronDown, ChevronRight,
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
  /** free-code tool_use id — used for matching running → completed */
  id?: string;
  name: string;
  /** Parsed input args from the agent */
  input?: Record<string, unknown>;
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
  /** Number of SysML code blocks auto-synced to editor */
  codesSynced: number;
  /** Duration from free-code result message */
  durationMs?: number;
  timestamp: number;
}

interface AIChatPanelProps {
  onApplyCode: (code: string) => void;
  currentCode?: string;
}

interface BackendStatus {
  ok: boolean;
  server?: string;
  version?: string;
  configured?: boolean;
  providerLabel?: string;
  free_code_server_url?: string;
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
  { label: '创建系统模型', prompt: '帮我创建一个无人机系统模型，包含飞行控制、电力、通信子系统，每个子系统有属性和端口，保存为 drone_system.sysml。' },
  { label: '添加需求定义', prompt: '帮我创建需求定义，包含最大飞行高度、最大速度和续航时间的需求，保存为 requirements.sysml。' },
  { label: '创建状态机',   prompt: '帮我创建无人机飞行状态机，包含待机、起飞、巡航、降落、紧急着陆状态，保存为 flight_states.sysml。' },
  { label: '定义接口',     prompt: '帮我定义通信接口和数据流，包含遥控信号输入端口和遥测数据输出端口，保存为 interfaces.sysml。' },
];

/* ------------------------------------------------------------------ */
/*  Tool icon + summary helpers                                       */
/* ------------------------------------------------------------------ */

function ToolIcon({ name, size = 9 }: { name: string; size?: number }) {
  const n = name.toLowerCase();
  if (n === 'bash')                         return <Terminal size={size} />;
  if (n === 'write')                        return <FilePen size={size} />;
  if (n === 'read')                         return <FileText size={size} />;
  if (n === 'edit' || n === 'multiedit')    return <FilePen size={size} />;
  if (n === 'glob' || n === 'listdir')      return <FolderOpen size={size} />;
  if (n === 'grep')                         return <Search size={size} />;
  if (n === 'webfetch')                     return <Globe size={size} />;
  if (n === 'todoread' || n === 'todowrite') return <Square size={size} />;
  return <Wrench size={size} />;
}

function getToolSummary(name: string, input?: Record<string, unknown>): string {
  if (!input) return '';
  const n = name.toLowerCase();
  if (n === 'bash') {
    const cmd = String(input.command ?? input.cmd ?? '').trim();
    return cmd.length > 60 ? cmd.slice(0, 57) + '…' : cmd;
  }
  if (n === 'write' || n === 'read' || n === 'edit' || n === 'multiedit') {
    return String(input.file_path ?? input.path ?? input.new_path ?? '');
  }
  if (n === 'glob') return String(input.pattern ?? '');
  if (n === 'grep') return `"${String(input.pattern ?? '')}"`;
  if (n === 'webfetch') {
    const url = String(input.url ?? '');
    return url.length > 50 ? url.slice(0, 47) + '…' : url;
  }
  return '';
}

function getToolLabel(name: string): string {
  const n = name.toLowerCase();
  if (n === 'bash')      return 'Bash';
  if (n === 'write')     return 'Write';
  if (n === 'read')      return 'Read';
  if (n === 'edit')      return 'Edit';
  if (n === 'multiedit') return 'MultiEdit';
  if (n === 'listdir')   return 'ListDir';
  if (n === 'glob')      return 'Glob';
  if (n === 'grep')      return 'Grep';
  if (n === 'webfetch')  return 'WebFetch';
  if (n === 'todoread')  return 'TodoRead';
  if (n === 'todowrite') return 'TodoWrite';
  return name;
}

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
    if (className?.includes('language-')) {
      return (
        <code className="text-[12px] font-mono text-[var(--text-main)]" {...props}>
          {children}
        </code>
      );
    }
    return (
      <code className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-xs font-mono text-purple-600 dark:text-purple-400" {...props}>
        {children}
      </code>
    );
  },
  pre: ({ children, ...props }: React.HTMLAttributes<HTMLPreElement>) => (
    <div className="my-2 rounded-lg overflow-hidden border border-[var(--border-color)]">
      <pre className="p-3 overflow-x-auto text-[12px] font-mono bg-slate-50 dark:bg-slate-900 text-[var(--text-main)]" {...props}>
        {children}
      </pre>
    </div>
  ),
  ul: ({ children, ...props }: React.HTMLAttributes<HTMLUListElement>) => (
    <ul className="list-disc pl-5 mb-2 space-y-1" {...props}>{children}</ul>
  ),
  ol: ({ children, ...props }: React.HTMLAttributes<HTMLOListElement>) => (
    <ol className="list-decimal pl-5 mb-2 space-y-1" {...props}>{children}</ol>
  ),
  li: ({ children, ...props }: React.HTMLAttributes<HTMLLIElement>) => (
    <li className="text-[13px]" {...props}>{children}</li>
  ),
  h1: ({ children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h1 className="text-base font-bold mb-1.5 text-[var(--text-main)]" {...props}>{children}</h1>
  ),
  h2: ({ children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h2 className="text-sm font-bold mb-1 text-[var(--text-main)]" {...props}>{children}</h2>
  ),
  h3: ({ children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h3 className="text-[13px] font-bold mb-1 text-[var(--text-main)]" {...props}>{children}</h3>
  ),
  blockquote: ({ children, ...props }: React.HTMLAttributes<HTMLQuoteElement>) => (
    <blockquote className="border-l-2 border-purple-500/30 pl-3 my-1.5 text-[var(--text-muted)]" {...props}>{children}</blockquote>
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

  // Conversation state — persists across messages for multi-turn sessions
  const [conversationId, setConversationId] = useState<string | null>(null);

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
        if (!data.ok) {
          setBackendError('sysml-server 未就绪');
        }
      })
      .catch(() => {
        setBackendError('无法连接后端服务。请在 apps/sysml-server 目录下运行: pnpm dev');
      });
  }, []);

  const aiAvailable = backendStatus?.ok === true;

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
        setConversationId(null);
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
    let durationMs: number | undefined;

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
          conversationId: conversationId || undefined,
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
                case 'session': {
                  // Store conversation ID for follow-up messages
                  if (data.conversationId) {
                    setConversationId(data.conversationId);
                  }
                  break;
                }
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
                    id: data.id,
                    name: data.name || 'unknown',
                    input: data.input,
                    status: data.status,
                    result: data.result,
                    timestamp: Date.now(),
                  };
                  // Update existing running entry by ID, or append
                  let existingIdx = -1;
                  if (data.id && data.status !== 'running') {
                    for (let i = toolCallAcc.length - 1; i >= 0; i--) {
                      if (toolCallAcc[i].id === data.id && toolCallAcc[i].status === 'running') {
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
                case 'result': {
                  if (typeof data.duration_ms === 'number') {
                    durationMs = data.duration_ms;
                  }
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
                      provider: backendStatus?.providerLabel || 'free-code',
                      thinkingSteps: [...thinkingAcc], toolCalls: [...toolCallAcc],
                      codesSynced: codeCount, durationMs, timestamp: Date.now(),
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
  }, [aiAvailable, backendStatus, conversationId, currentCode, executeCommand, input, loading, messages, onApplyCode]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  }, [handleSend]);

  const handleNewChat = useCallback(() => {
    setMessages([]);
    setInput('');
    setConversationId(null);
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
          <span className="text-[12px] font-bold text-[var(--text-muted)] uppercase tracking-wider">
            Copilot
          </span>
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 font-medium">
            Agent
          </span>
        </div>
        <div className="flex items-center gap-1">
          {backendStatus && (
            <span className="px-2 py-0.5 rounded border border-[var(--border-color)] text-[11px] font-medium text-[var(--text-muted)]">
              free-code
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
            <span className="text-[12px] text-amber-600 dark:text-amber-400">{backendError}</span>
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
              <p className="text-[12px] text-[var(--text-muted)] max-w-[280px] mx-auto leading-relaxed">
                free-code Agent · 实时工具调用 · 文件直接写入编辑器
              </p>
              <p className="text-[11px] text-[var(--text-muted)] mt-2">
                输入 <code className="px-1 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-purple-600 dark:text-purple-400 text-[10px] font-mono">/</code> 查看命令
              </p>
            </div>
            <div className="space-y-1.5">
              <div className="text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-wider px-1">快速开始</div>
              {QUICK_PROMPTS.map((qp, i) => (
                <button key={i} onClick={() => handleSend(qp.prompt)} disabled={loading || !aiAvailable}
                  className="w-full text-left p-2 rounded-lg border border-[var(--border-color)] bg-[var(--bg-main)] hover:border-purple-500/50 hover:bg-purple-500/5 transition-all group disabled:opacity-50">
                  <div className="flex items-center gap-2">
                    <MessageSquare size={11} className="text-purple-500 flex-shrink-0" />
                    <span className="text-[12px] font-medium text-[var(--text-main)] group-hover:text-purple-600 dark:group-hover:text-purple-400">{qp.label}</span>
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
              <div className="space-y-1.5">
                {/* Thinking steps */}
                {streamingThinking.length > 0 && (
                  <div className="ml-1 border-l-2 border-purple-500/30 pl-2">
                    <div className="flex items-center gap-1.5 mb-1 text-[10px] font-bold text-purple-500 uppercase">
                      <Brain size={8} />
                      <span>思考中…</span>
                    </div>
                    <div className="space-y-0.5 max-h-[80px] overflow-hidden">
                      {streamingThinking.slice(-3).map((step, si) => (
                        <div key={si} className="text-[11px] text-[var(--text-muted)] line-clamp-2">
                          {step.content}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Tool calls */}
                {streamingToolCalls.length > 0 && (
                  <div className="space-y-0.5">
                    {streamingToolCalls.map((tc, ti) => (
                      <StreamingToolCall key={ti} tc={tc} />
                    ))}
                  </div>
                )}

                {/* Code synced badge */}
                {streamingCodeCount > 0 && (
                  <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                    <CheckCircle size={9} />
                    <span>{streamingCodeCount} 个文件已同步到编辑器</span>
                  </div>
                )}

                {/* Streaming content */}
                {streamingContent ? (
                  <div className="rounded-lg p-3 bg-[var(--bg-main)] border border-[var(--border-color)]">
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <Sparkles size={10} className="text-purple-500" />
                      <span className="text-[11px] font-bold text-purple-500 uppercase">
                        free-code
                      </span>
                    </div>
                    <div className="text-[13px] text-[var(--text-main)] leading-relaxed prose-sm">
                      <Markdown components={mdComponents}>{streamingContent}</Markdown>
                      <span className="inline-block w-1.5 h-3.5 bg-purple-500 animate-pulse ml-0.5 -mb-0.5 rounded-sm" />
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-[var(--bg-main)] border border-[var(--border-color)]">
                    <Loader2 size={14} className="text-purple-500 animate-spin" />
                    <span className="text-[13px] text-[var(--text-muted)]">
                      Agent 工作中…
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
          <div className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-1 px-1">命令</div>
          {SLASH_COMMANDS.map(cmd => (
            <button key={cmd.name} onClick={() => executeCommand(cmd.name)}
              className="w-full text-left px-2 py-1 rounded flex items-center gap-2 hover:bg-purple-500/10 transition-colors">
              <span className="text-purple-500">{cmd.icon}</span>
              <span className="text-[12px] font-mono font-bold text-[var(--text-main)]">{cmd.label}</span>
              <span className="text-[13px] text-[var(--text-muted)]">{cmd.description}</span>
            </button>
          ))}
        </div>
      )}

      {/* Input area */}
      <div className="border-t border-[var(--border-color)] p-2 flex-shrink-0">
        {!aiAvailable && !backendError && (
          <div className="mb-2 flex items-center gap-1.5 px-2 py-1 rounded bg-amber-500/10 border border-amber-500/20">
            <AlertCircle size={11} className="text-amber-500 flex-shrink-0" />
            <span className="text-[13px] text-amber-600 dark:text-amber-400">正在连接后端…</span>
          </div>
        )}
        <div className="flex items-end gap-1.5">
          <textarea ref={inputRef} value={input} onChange={handleInputChange} onKeyDown={handleKeyDown}
            placeholder={aiAvailable ? '描述您想要的模型，输入 / 查看命令…' : '等待后端连接…'}
            disabled={loading} rows={1}
            className="flex-1 bg-[var(--bg-main)] border border-[var(--border-color)] rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500/20 transition-all resize-none text-[var(--text-main)] placeholder:text-[var(--text-muted)] disabled:opacity-50 min-h-[36px] max-h-[120px]"
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
/*  StreamingToolCall — inline tool row during streaming             */
/* ------------------------------------------------------------------ */

const StreamingToolCall: React.FC<{ tc: ToolCall }> = ({ tc }) => {
  const summary = getToolSummary(tc.name, tc.input);
  const label = getToolLabel(tc.name);

  return (
    <div className={cn(
      'flex items-center gap-1.5 px-2 py-1 rounded-md border text-[11px]',
      tc.status === 'running'
        ? 'bg-blue-500/5 border-blue-500/20'
        : tc.status === 'completed'
        ? 'bg-emerald-500/5 border-emerald-500/20'
        : 'bg-red-500/5 border-red-500/20',
    )}>
      <span className={cn(
        tc.status === 'running' ? 'text-blue-500' :
        tc.status === 'completed' ? 'text-emerald-500' : 'text-red-500',
      )}>
        {tc.status === 'running'
          ? <Loader2 size={9} className="animate-spin" />
          : tc.status === 'completed'
          ? <CheckCircle size={9} />
          : <XCircle size={9} />}
      </span>
      <span className={cn(
        'text-[var(--text-muted)]',
        tc.status === 'running' ? 'text-blue-600 dark:text-blue-400' :
        tc.status === 'completed' ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500',
      )}>
        <ToolIcon name={tc.name} size={9} />
      </span>
      <span className="font-mono font-medium text-[var(--text-main)]">{label}</span>
      {summary && (
        <span className="text-[var(--text-muted)] truncate flex-1 max-w-[200px]">{summary}</span>
      )}
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
      {/* Thinking (collapsed details) */}
      {msg.thinkingSteps.length > 0 && (
        <ThinkingBlock steps={msg.thinkingSteps} />
      )}

      {/* Tool calls */}
      {msg.toolCalls.length > 0 && (
        <div className="mb-1.5 space-y-0.5">
          {msg.toolCalls.map((tc, ti) => (
            <ToolCallRow key={ti} tc={tc} />
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
            <span className="text-[10px] font-bold text-blue-500 uppercase">You</span>
          ) : msg.role === 'error' ? (
            <><AlertCircle size={9} className="text-red-500" /><span className="text-[10px] font-bold text-red-500 uppercase">Error</span></>
          ) : msg.role === 'system' ? (
            <><Terminal size={9} className="text-[var(--text-muted)]" /><span className="text-[10px] font-bold text-[var(--text-muted)] uppercase">System</span></>
          ) : (
            <>
              <Sparkles size={9} className="text-purple-500" />
              <span className="text-[10px] font-bold text-purple-500 uppercase">{msg.provider || 'free-code'}</span>
              <div className="flex items-center gap-1.5 ml-auto">
                {msg.codesSynced > 0 && (
                  <span className="text-[9px] px-1 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 font-medium flex items-center gap-0.5">
                    <CheckCircle size={7} /> {msg.codesSynced} 已同步
                  </span>
                )}
                {msg.durationMs !== undefined && (
                  <span className="text-[9px] px-1 py-0.5 rounded bg-slate-500/10 text-[var(--text-muted)] border border-[var(--border-color)] font-medium flex items-center gap-0.5">
                    <Clock size={7} /> {(msg.durationMs / 1000).toFixed(1)}s
                  </span>
                )}
              </div>
            </>
          )}
        </div>

        {/* Content */}
        <div className="text-[13px] text-[var(--text-main)] leading-relaxed">
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

/* ------------------------------------------------------------------ */
/*  ThinkingBlock — collapsible thinking steps                       */
/* ------------------------------------------------------------------ */

const ThinkingBlock: React.FC<{ steps: ThinkingStep[] }> = ({ steps }) => {
  const [open, setOpen] = useState(false);

  return (
    <div className="mb-1.5 rounded-md border border-purple-500/20 bg-purple-500/5 overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-1.5 px-2 py-1.5 text-[11px] text-purple-600 dark:text-purple-400 hover:bg-purple-500/10 transition-colors"
      >
        <Brain size={9} />
        <span className="font-medium">思考过程 ({steps.length} 步)</span>
        <span className="ml-auto">{open ? <ChevronDown size={9} /> : <ChevronRight size={9} />}</span>
      </button>
      {open && (
        <div className="px-3 pb-2 space-y-1 border-t border-purple-500/10">
          {steps.map((step, si) => (
            <div key={si} className="flex items-start gap-1.5 pt-1 text-[11px] text-[var(--text-muted)]">
              <Terminal size={7} className="text-purple-400 mt-0.5 flex-shrink-0" />
              <span className="leading-relaxed">{step.content}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

/* ------------------------------------------------------------------ */
/*  ToolCallRow — single completed tool call with expandable result  */
/* ------------------------------------------------------------------ */

const ToolCallRow: React.FC<{ tc: ToolCall }> = ({ tc }) => {
  const [expanded, setExpanded] = useState(false);
  const summary = getToolSummary(tc.name, tc.input);
  const label = getToolLabel(tc.name);
  const hasResult = Boolean(tc.result?.trim());

  return (
    <div className={cn(
      'rounded-md border text-[11px] overflow-hidden',
      tc.status === 'completed' ? 'border-[var(--border-color)] bg-[var(--bg-main)]' : 'border-red-500/20 bg-red-500/5',
    )}>
      <button
        onClick={() => hasResult && setExpanded(v => !v)}
        className={cn(
          'w-full flex items-center gap-1.5 px-2 py-1 transition-colors',
          hasResult ? 'hover:bg-[var(--border-color)]/50 cursor-pointer' : 'cursor-default',
        )}
      >
        <span className={tc.status === 'completed' ? 'text-emerald-500' : 'text-red-500'}>
          {tc.status === 'completed'
            ? <CheckCircle size={8} />
            : <XCircle size={8} />}
        </span>
        <span className="text-[var(--text-muted)]">
          <ToolIcon name={tc.name} size={8} />
        </span>
        <span className="font-mono font-medium text-[var(--text-main)]">{label}</span>
        {summary && (
          <span className="text-[var(--text-muted)] truncate flex-1 max-w-[200px] text-left">{summary}</span>
        )}
        {hasResult && (
          <span className="ml-auto text-[var(--text-muted)]">
            {expanded ? <ChevronDown size={8} /> : <ChevronRight size={8} />}
          </span>
        )}
      </button>
      {expanded && hasResult && (
        <div className="px-3 pb-2 pt-1 border-t border-[var(--border-color)] bg-slate-50 dark:bg-slate-900/50">
          <pre className="text-[11px] font-mono text-[var(--text-muted)] whitespace-pre-wrap break-words max-h-[120px] overflow-y-auto">
            {tc.result}
          </pre>
        </div>
      )}
    </div>
  );
};
