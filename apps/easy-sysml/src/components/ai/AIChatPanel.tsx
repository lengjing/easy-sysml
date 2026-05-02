/**
 * AI Chat Panel — Google AI Studio-style Agent Interface
 *
 * Communicates with sysml-server via SSE streaming, which proxies to free-code agent.
 * - Streams markdown content token-by-token (rendered via react-markdown)
 * - Auto-applies SysML code to editor when the agent writes a .sysml file
 * - Shows action history inline: "Thought for X.X seconds", "Read file", "Edited file", etc.
 * - Supports slash commands: /code, /help, /clear
 * - Maintains conversation state (conversationId) for multi-turn sessions
 */
import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import Markdown from 'react-markdown';
import {
  Sparkles, Send, Plus, Loader2,
  AlertCircle, Brain, Terminal,
  FileCode, HelpCircle, Trash2, CheckCircle, Wrench,
  XCircle, FileText, FilePen, Search, FolderOpen,
  Globe, Square, Clock, ChevronDown, ChevronRight,
  StopCircle, Zap, Play,
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
  /** How long the model spent thinking (ms) before first tool/response */
  thinkingDurationMs?: number;
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
/*  Tool icon + action label helpers (Google AI Studio style)         */
/* ------------------------------------------------------------------ */

function ToolIcon({ name, size = 12 }: { name: string; size?: number }) {
  const n = name.toLowerCase();
  if (n === 'bash')                          return <Terminal size={size} />;
  if (n === 'write')                         return <FilePen size={size} />;
  if (n === 'read')                          return <FileText size={size} />;
  if (n === 'edit' || n === 'multiedit')     return <FilePen size={size} />;
  if (n === 'glob' || n === 'listdir')       return <FolderOpen size={size} />;
  if (n === 'grep')                          return <Search size={size} />;
  if (n === 'webfetch')                      return <Globe size={size} />;
  if (n === 'todoread' || n === 'todowrite') return <Square size={size} />;
  return <Wrench size={size} />;
}

/** Returns a human-readable action description (Google AI Studio style) */
function getActionDescription(name: string, input?: Record<string, unknown>): string {
  const n = name.toLowerCase();

  if (n === 'read') {
    const file = String(input?.file_path ?? input?.path ?? '');
    return file ? `Read file ${getBasename(file)}` : 'Read file';
  }
  if (n === 'write') {
    const file = String(input?.file_path ?? input?.path ?? '');
    return file ? `Wrote to ${getBasename(file)}` : 'Wrote file';
  }
  if (n === 'edit' || n === 'multiedit') {
    const file = String(input?.file_path ?? input?.path ?? input?.new_path ?? '');
    return file ? `Edited ${getBasename(file)}` : 'Edited file';
  }
  if (n === 'bash') {
    const cmd = String(input?.command ?? input?.cmd ?? '').trim();
    if (/lint|format|check|validate|prettier|eslint|tsc|typecheck/.test(cmd)) {
      return 'Ran quality control';
    }
    if (/test|spec|jest|vitest|mocha/.test(cmd)) {
      return 'Ran tests';
    }
    if (/ls|find|cat|head|tail|pwd|echo/.test(cmd.split(' ')[0] ?? '')) {
      return 'Explored files';
    }
    const shortCmd = cmd.length > 40 ? cmd.slice(0, 37) + '…' : cmd;
    return shortCmd ? `Ran: ${shortCmd}` : 'Ran shell command';
  }
  if (n === 'grep') {
    const pattern = String(input?.pattern ?? '');
    return pattern ? `Searched for "${pattern.slice(0, 30)}"` : 'Searched in files';
  }
  if (n === 'glob') {
    const pat = String(input?.pattern ?? '');
    return pat ? `Listed files (${pat})` : 'Listed files';
  }
  if (n === 'listdir') {
    const dir = String(input?.path ?? '.');
    return `Listed ${getBasename(dir) || '.'}`;
  }
  if (n === 'webfetch') {
    const url = String(input?.url ?? '');
    try {
      return `Fetched ${new URL(url).hostname}`;
    } catch {
      return 'Fetched URL';
    }
  }
  if (n === 'todoread')  return 'Read task list';
  if (n === 'todowrite') return 'Updated task list';
  return name;
}

function getBasename(filePath: string): string {
  return filePath.split('/').pop()?.split('\\').pop() ?? filePath;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

/** Fraction of total duration to attribute to thinking when no end-marker was observed */
const THINKING_DURATION_ESTIMATE_RATIO = 0.3;
/** Cap on estimated thinking duration in ms */
const MAX_THINKING_DURATION_MS = 10_000;

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

  // Thinking duration tracking
  const thinkingStartTsRef = useRef<number | null>(null);
  const thinkingEndTsRef = useRef<number | null>(null);

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
    thinkingStartTsRef.current = null;
    thinkingEndTsRef.current = null;

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
                  if (data.conversationId) {
                    setConversationId(data.conversationId);
                  }
                  break;
                }
                case 'thinking': {
                  const now = Date.now();
                  if (thinkingStartTsRef.current === null) {
                    thinkingStartTsRef.current = now;
                  }
                  const step: ThinkingStep = { content: data.content, timestamp: now };
                  thinkingAcc.push(step);
                  setStreamingThinking([...thinkingAcc]);
                  break;
                }
                case 'delta': {
                  // Mark end of thinking when first content arrives
                  if (thinkingStartTsRef.current !== null && thinkingEndTsRef.current === null) {
                    thinkingEndTsRef.current = Date.now();
                  }
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
                  // Mark end of thinking when first tool call arrives
                  if (thinkingStartTsRef.current !== null && thinkingEndTsRef.current === null) {
                    thinkingEndTsRef.current = Date.now();
                  }
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
                  if (contentAcc.trim() || codeCount > 0 || toolCallAcc.length > 0) {
                    const thinkingDurationMs =
                      thinkingStartTsRef.current !== null && thinkingEndTsRef.current !== null
                        ? thinkingEndTsRef.current - thinkingStartTsRef.current
                        : thinkingAcc.length > 0 && durationMs
                        ? Math.min(durationMs * THINKING_DURATION_ESTIMATE_RATIO, MAX_THINKING_DURATION_MS)
                        : undefined;
                    const assistantMsg: ChatMessage = {
                      id: makeId(), role: 'assistant', content: contentAcc,
                      provider: backendStatus?.providerLabel || 'free-code',
                      thinkingSteps: [...thinkingAcc], toolCalls: [...toolCallAcc],
                      codesSynced: codeCount, durationMs, thinkingDurationMs,
                      timestamp: Date.now(),
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
      {/* Header — Google AI Studio style */}
      <div className="h-11 border-b border-[var(--border-color)] flex items-center justify-between px-3 bg-[var(--bg-header)] flex-shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center flex-shrink-0">
            <Sparkles size={12} className="text-white" />
          </div>
          <span className="text-[13px] font-semibold text-[var(--text-main)]">
            Agent
          </span>
          {backendStatus?.ok && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 font-medium">
              free-code
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {loading && (
            <button
              onClick={() => { abortRef.current?.abort(); }}
              className="flex items-center gap-1 px-2 py-1 rounded text-[11px] text-red-500 hover:bg-red-500/10 transition-colors border border-red-500/20"
              title="停止生成"
            >
              <StopCircle size={11} />
              <span>停止</span>
            </button>
          )}
          <button
            onClick={handleNewChat}
            className="p-1.5 hover:bg-[var(--border-color)] rounded text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors"
            title="新对话"
          >
            <Plus size={14} />
          </button>
        </div>
      </div>

      {/* Error banner */}
      {backendError && (
        <div className="border-b border-[var(--border-color)] p-2 bg-amber-500/10 flex-shrink-0">
          <div className="flex items-center gap-1.5 px-2 py-1">
            <AlertCircle size={12} className="text-amber-500 flex-shrink-0" />
            <span className="text-[12px] text-amber-600 dark:text-amber-400">{backendError}</span>
          </div>
        </div>
      )}

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto custom-scrollbar">
        {messages.length === 0 && !loading ? (
          /* Welcome screen */
          <div className="p-4 flex flex-col gap-4">
            <div className="text-center py-8">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-gradient-to-br from-purple-500/20 to-blue-500/20 mb-4">
                <Sparkles size={28} className="text-purple-500" />
              </div>
              <h3 className="text-sm font-semibold text-[var(--text-main)] mb-1.5">SysML v2 Agent</h3>
              <p className="text-[12px] text-[var(--text-muted)] max-w-[260px] mx-auto leading-relaxed">
                由 free-code Agent 驱动，可直接读写文件、执行命令，并将 SysML 代码同步到编辑器
              </p>
              <p className="text-[11px] text-[var(--text-muted)] mt-2">
                输入 <code className="px-1 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-purple-600 dark:text-purple-400 text-[10px] font-mono">/</code> 查看命令
              </p>
            </div>
            <div className="space-y-2">
              <div className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider px-1 mb-1">快速开始</div>
              {QUICK_PROMPTS.map((qp, i) => (
                <button key={i} onClick={() => handleSend(qp.prompt)} disabled={loading || !aiAvailable}
                  className="w-full text-left p-2.5 rounded-xl border border-[var(--border-color)] bg-[var(--bg-main)] hover:border-purple-500/40 hover:bg-purple-500/5 transition-all group disabled:opacity-50">
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 rounded-md bg-purple-500/10 flex items-center justify-center flex-shrink-0">
                      <Zap size={10} className="text-purple-500" />
                    </div>
                    <span className="text-[12px] font-medium text-[var(--text-main)] group-hover:text-purple-600 dark:group-hover:text-purple-400">{qp.label}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="p-3 space-y-4">
            {messages.map(msg => (
              <MessageBubble key={msg.id} msg={msg} mdComponents={mdComponents} />
            ))}

            {/* Live streaming area */}
            {loading && (
              <LiveStreamingView
                thinking={streamingThinking}
                toolCalls={streamingToolCalls}
                content={streamingContent}
                codeCount={streamingCodeCount}
                mdComponents={mdComponents}
              />
            )}
          </div>
        )}
      </div>

      {/* Slash command popup */}
      {showCommands && (
        <div className="border-t border-[var(--border-color)] bg-[var(--bg-main)] px-2 py-1.5 flex-shrink-0">
          <div className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-1 px-1">命令</div>
          {SLASH_COMMANDS.map(cmd => (
            <button key={cmd.name} onClick={() => executeCommand(cmd.name)}
              className="w-full text-left px-2 py-1.5 rounded-lg flex items-center gap-2 hover:bg-purple-500/10 transition-colors">
              <span className="text-purple-500">{cmd.icon}</span>
              <span className="text-[12px] font-mono font-semibold text-[var(--text-main)]">{cmd.label}</span>
              <span className="text-[12px] text-[var(--text-muted)]">{cmd.description}</span>
            </button>
          ))}
        </div>
      )}

      {/* Input area */}
      <div className="border-t border-[var(--border-color)] p-2.5 flex-shrink-0 bg-[var(--bg-main)]">
        {!aiAvailable && !backendError && (
          <div className="mb-2 flex items-center gap-1.5 px-2 py-1 rounded-lg bg-amber-500/10 border border-amber-500/20">
            <Loader2 size={11} className="text-amber-500 animate-spin flex-shrink-0" />
            <span className="text-[12px] text-amber-600 dark:text-amber-400">正在连接后端…</span>
          </div>
        )}
        <div className="flex items-end gap-2">
          <textarea ref={inputRef} value={input} onChange={handleInputChange} onKeyDown={handleKeyDown}
            placeholder={aiAvailable ? '向 Agent 发送消息… (/ 查看命令)' : '等待后端连接…'}
            disabled={loading} rows={1}
            className="flex-1 bg-[var(--bg-sidebar)] border border-[var(--border-color)] rounded-xl px-3 py-2 text-[13px] focus:outline-none focus:border-purple-500/60 focus:ring-1 focus:ring-purple-500/20 transition-all resize-none text-[var(--text-main)] placeholder:text-[var(--text-muted)] disabled:opacity-50 min-h-[38px] max-h-[120px]"
            style={{ height: 'auto' }}
            onInput={(e) => { const t = e.currentTarget; t.style.height = 'auto'; t.style.height = Math.min(t.scrollHeight, 120) + 'px'; }}
          />
          <button onClick={() => handleSend()} disabled={loading || !input.trim() || !aiAvailable}
            className={cn('p-2 rounded-xl transition-all flex-shrink-0',
              input.trim() && aiAvailable
                ? 'bg-purple-500 text-white hover:bg-purple-600 shadow-sm shadow-purple-500/30'
                : 'bg-[var(--border-color)] text-[var(--text-muted)] cursor-not-allowed')}
            title="发送 (Enter)">
            <Send size={14} />
          </button>
        </div>
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/*  LiveStreamingView — live action feed during streaming             */
/* ------------------------------------------------------------------ */

const LiveStreamingView: React.FC<{
  thinking: ThinkingStep[];
  toolCalls: ToolCall[];
  content: string;
  codeCount: number;
  mdComponents: Record<string, React.FC<any>>;
}> = ({ thinking, toolCalls, content, codeCount, mdComponents }) => {
  const hasActions = thinking.length > 0 || toolCalls.length > 0;

  return (
    <div className="space-y-2">
      {/* Agent avatar + label */}
      <div className="flex items-center gap-2">
        <div className="w-6 h-6 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center flex-shrink-0">
          <Sparkles size={11} className="text-white" />
        </div>
        <span className="text-[12px] font-semibold text-[var(--text-main)]">Agent</span>
        <Loader2 size={11} className="text-purple-500 animate-spin ml-1" />
      </div>

      {/* Live action history */}
      {hasActions && (
        <div className="ml-8 rounded-xl border border-[var(--border-color)] bg-[var(--bg-main)] overflow-hidden">
          {/* Thinking row — live */}
          {thinking.length > 0 && (
            <div className="flex items-center gap-2.5 px-3 py-2 border-b border-[var(--border-color)] last:border-b-0">
              <Brain size={12} className="text-purple-500 flex-shrink-0 animate-pulse" />
              <span className="text-[12px] text-[var(--text-muted)]">
                正在思考…
              </span>
              <span className="ml-auto text-[10px] text-purple-400 font-medium">
                {thinking.length} 步
              </span>
            </div>
          )}
          {/* Tool call rows */}
          {toolCalls.map((tc, i) => (
            <LiveActionRow key={i} tc={tc} />
          ))}
          {/* Code synced */}
          {codeCount > 0 && (
            <div className="flex items-center gap-2.5 px-3 py-2 border-t border-[var(--border-color)] bg-emerald-500/5">
              <CheckCircle size={12} className="text-emerald-500 flex-shrink-0" />
              <span className="text-[12px] text-emerald-600 dark:text-emerald-400 font-medium">
                已写入 {codeCount} 个 .sysml 文件
              </span>
            </div>
          )}
        </div>
      )}

      {/* Streaming response text */}
      {content ? (
        <div className="ml-8">
          <div className="text-[13px] text-[var(--text-main)] leading-relaxed">
            <Markdown components={mdComponents}>{content}</Markdown>
            <span className="inline-block w-1.5 h-3.5 bg-purple-500 animate-pulse ml-0.5 -mb-0.5 rounded-sm" />
          </div>
        </div>
      ) : !hasActions ? (
        <div className="ml-8 text-[12px] text-[var(--text-muted)]">
          正在生成…
        </div>
      ) : null}
    </div>
  );
};

/* ------------------------------------------------------------------ */
/*  LiveActionRow — single action row during streaming               */
/* ------------------------------------------------------------------ */

const LiveActionRow: React.FC<{ tc: ToolCall }> = ({ tc }) => {
  const desc = getActionDescription(tc.name, tc.input);
  const isRunning = tc.status === 'running';
  const isError = tc.status === 'error';

  return (
    <div className={cn(
      'flex items-center gap-2.5 px-3 py-2 border-b border-[var(--border-color)] last:border-b-0',
      isError && 'bg-red-500/5',
    )}>
      <span className={cn(
        'flex-shrink-0',
        isRunning ? 'text-blue-500' : isError ? 'text-red-500' : 'text-emerald-500',
      )}>
        {isRunning
          ? <Loader2 size={12} className="animate-spin" />
          : isError
          ? <XCircle size={12} />
          : <CheckCircle size={12} />}
      </span>
      <span className={cn(
        'flex-shrink-0',
        isRunning ? 'text-[var(--text-muted)]' : isError ? 'text-red-400' : 'text-[var(--text-muted)]',
      )}>
        <ToolIcon name={tc.name} size={11} />
      </span>
      <span className={cn(
        'text-[12px]',
        isRunning ? 'text-[var(--text-main)]' : isError ? 'text-red-500' : 'text-[var(--text-main)]',
      )}>
        {desc}
      </span>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/*  MessageBubble — Google AI Studio-style message rendering         */
/* ------------------------------------------------------------------ */

const MessageBubble: React.FC<{
  msg: ChatMessage;
  mdComponents: Record<string, React.FC<any>>;
}> = React.memo(({ msg, mdComponents }) => {

  /* ── User message ── */
  if (msg.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-tr-sm px-3.5 py-2.5 bg-blue-500/10 border border-blue-500/15">
          <p className="text-[13px] text-[var(--text-main)] whitespace-pre-wrap break-words leading-relaxed">
            {msg.content}
          </p>
        </div>
      </div>
    );
  }

  /* ── System message ── */
  if (msg.role === 'system') {
    return (
      <div className="flex justify-center">
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[var(--border-color)]/60 text-[11px] text-[var(--text-muted)]">
          <Terminal size={10} />
          <span>{msg.content}</span>
        </div>
      </div>
    );
  }

  /* ── Error message ── */
  if (msg.role === 'error') {
    return (
      <div className="flex gap-2.5">
        <div className="w-6 h-6 rounded-full bg-red-500/10 flex items-center justify-center flex-shrink-0 mt-0.5">
          <AlertCircle size={12} className="text-red-500" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[12px] font-semibold text-red-500">错误</span>
          </div>
          <div className="rounded-xl border border-red-500/20 bg-red-500/5 px-3 py-2">
            <p className="text-[12px] text-red-600 dark:text-red-400 whitespace-pre-wrap break-words">
              {msg.content}
            </p>
          </div>
        </div>
      </div>
    );
  }

  /* ── Assistant message — Google AI Studio style ── */
  const hasActions = msg.thinkingSteps.length > 0 || msg.toolCalls.length > 0;

  return (
    <div className="flex gap-2.5">
      {/* Avatar */}
      <div className="w-6 h-6 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center flex-shrink-0 mt-0.5">
        <Sparkles size={11} className="text-white" />
      </div>

      <div className="flex-1 min-w-0 space-y-2">
        {/* Header row */}
        <div className="flex items-center gap-2">
          <span className="text-[12px] font-semibold text-[var(--text-main)]">Agent</span>
          {msg.durationMs !== undefined && (
            <span className="flex items-center gap-1 text-[10px] text-[var(--text-muted)]">
              <Clock size={9} />
              {(msg.durationMs / 1000).toFixed(1)}s
            </span>
          )}
          {msg.codesSynced > 0 && (
            <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 font-medium">
              <CheckCircle size={9} />
              {msg.codesSynced} 文件已同步
            </span>
          )}
        </div>

        {/* Action history block */}
        {hasActions && (
          <ActionHistoryBlock
            thinkingSteps={msg.thinkingSteps}
            toolCalls={msg.toolCalls}
            thinkingDurationMs={msg.thinkingDurationMs}
          />
        )}

        {/* Response text */}
        {msg.content.trim() && (
          <div className="text-[13px] text-[var(--text-main)] leading-relaxed">
            <Markdown components={mdComponents}>{msg.content}</Markdown>
          </div>
        )}
      </div>
    </div>
  );
});

MessageBubble.displayName = 'MessageBubble';

/* ------------------------------------------------------------------ */
/*  ActionHistoryBlock — collapsible action history (AI Studio style) */
/* ------------------------------------------------------------------ */

const ActionHistoryBlock: React.FC<{
  thinkingSteps: ThinkingStep[];
  toolCalls: ToolCall[];
  thinkingDurationMs?: number;
}> = ({ thinkingSteps, toolCalls, thinkingDurationMs }) => {
  const [open, setOpen] = useState(true);
  const totalActions = (thinkingSteps.length > 0 ? 1 : 0) + toolCalls.length;

  return (
    <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-main)] overflow-hidden">
      {/* Collapse toggle */}
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-[var(--border-color)]/40 transition-colors text-left"
      >
        <Play size={10} className="text-[var(--text-muted)] flex-shrink-0" />
        <span className="text-[11px] font-semibold text-[var(--text-muted)] flex-1">
          Action history · {totalActions} 步
        </span>
        {open ? <ChevronDown size={12} className="text-[var(--text-muted)]" /> : <ChevronRight size={12} className="text-[var(--text-muted)]" />}
      </button>

      {open && (
        <div className="border-t border-[var(--border-color)]">
          {/* Thinking row */}
          {thinkingSteps.length > 0 && (
            <ThoughtRow steps={thinkingSteps} durationMs={thinkingDurationMs} />
          )}
          {/* Tool call rows */}
          {toolCalls.map((tc, i) => (
            <CompletedActionRow key={i} tc={tc} />
          ))}
        </div>
      )}
    </div>
  );
};

/* ------------------------------------------------------------------ */
/*  ThoughtRow — "Thought for X.X seconds" expandable row            */
/* ------------------------------------------------------------------ */

const ThoughtRow: React.FC<{ steps: ThinkingStep[]; durationMs?: number }> = ({
  steps,
  durationMs,
}) => {
  const [open, setOpen] = useState(false);

  const durationLabel = durationMs !== undefined
    ? `${(durationMs / 1000).toFixed(1)} 秒`
    : `${steps.length} 步`;

  return (
    <div className="border-b border-[var(--border-color)] last:border-b-0">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-purple-500/5 transition-colors text-left"
      >
        <Brain size={13} className="text-purple-500 flex-shrink-0" />
        <span className="text-[12px] text-[var(--text-main)] flex-1">
          Thought for <span className="font-semibold">{durationLabel}</span>
        </span>
        {open ? <ChevronDown size={11} className="text-[var(--text-muted)]" /> : <ChevronRight size={11} className="text-[var(--text-muted)]" />}
      </button>
      {open && (
        <div className="px-4 pb-3 pt-1 bg-purple-500/3 border-t border-purple-500/10 space-y-1.5 max-h-[200px] overflow-y-auto custom-scrollbar">
          {steps.map((step, i) => (
            <p key={i} className="text-[11px] text-[var(--text-muted)] leading-relaxed whitespace-pre-wrap">
              {step.content}
            </p>
          ))}
        </div>
      )}
    </div>
  );
};

/* ------------------------------------------------------------------ */
/*  CompletedActionRow — single completed tool call with expandable  */
/* ------------------------------------------------------------------ */

const CompletedActionRow: React.FC<{ tc: ToolCall }> = ({ tc }) => {
  const [open, setOpen] = useState(false);
  const desc = getActionDescription(tc.name, tc.input);
  const hasResult = Boolean(tc.result?.trim());
  const isError = tc.status === 'error';

  return (
    <div className={cn(
      'border-b border-[var(--border-color)] last:border-b-0',
      isError && 'bg-red-500/5',
    )}>
      <button
        onClick={() => hasResult && setOpen(v => !v)}
        className={cn(
          'w-full flex items-center gap-2.5 px-3 py-2.5 transition-colors text-left',
          hasResult ? 'hover:bg-[var(--border-color)]/40 cursor-pointer' : 'cursor-default',
        )}
      >
        <span className={cn('flex-shrink-0', isError ? 'text-red-500' : 'text-emerald-500')}>
          {isError ? <XCircle size={13} /> : <CheckCircle size={13} />}
        </span>
        <span className={cn('flex-shrink-0 text-[var(--text-muted)]')}>
          <ToolIcon name={tc.name} size={12} />
        </span>
        <span className={cn(
          'text-[12px] flex-1 min-w-0',
          isError ? 'text-red-600 dark:text-red-400' : 'text-[var(--text-main)]',
        )}>
          {desc}
        </span>
        {hasResult && (
          <span className="text-[var(--text-muted)] flex-shrink-0">
            {open ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
          </span>
        )}
      </button>
      {open && hasResult && (
        <div className="px-4 pb-3 pt-1 border-t border-[var(--border-color)] bg-slate-50 dark:bg-slate-900/40">
          <pre className="text-[11px] font-mono text-[var(--text-muted)] whitespace-pre-wrap break-words max-h-[150px] overflow-y-auto custom-scrollbar leading-relaxed">
            {tc.result}
          </pre>
        </div>
      )}
    </div>
  );
};
