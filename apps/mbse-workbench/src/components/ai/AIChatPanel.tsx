/**
 * AI Chat Panel
 *
 * Provides a conversational interface for generating SysML v2 text via
 * Gemini, DeepSeek, Qwen, or any OpenAI-compatible API. Users type a
 * natural-language description and the AI returns SysML v2 code that can
 * be applied to the editor.
 */
import React, { useState, useRef, useCallback, useEffect } from 'react';
import { GoogleGenAI } from '@google/genai';
import {
  Sparkles, Send, Copy, Check, Plus, Loader2,
  MessageSquare, Code, AlertCircle,
} from 'lucide-react';
import { cn } from '../../lib/utils';

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

type AIProvider = 'gemini' | 'deepseek' | 'qwen' | 'openai-compatible';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'error';
  content: string;
  provider?: string;
  /** Extracted SysML code blocks (if any). */
  codeBlocks: string[];
  timestamp: number;
}

interface AIChatPanelProps {
  /** Called when user clicks "Apply" on a code block — sets editor code. */
  onApplyCode: (code: string) => void;
  /** Current editor content — sent as context to the AI. */
  currentCode?: string;
}

interface AISettings {
  provider: AIProvider;
  apiKeys: Record<AIProvider, string>;
  model: string;
  baseUrl: string;
}

/* ------------------------------------------------------------------ */
/*  System prompt                                                     */
/* ------------------------------------------------------------------ */

const SYSTEM_PROMPT = `You are a professional SysML v2 modeling assistant. Your role is to help users create, modify, and understand SysML v2 models using the SysML v2 textual notation.

When the user asks you to create or modify a model, respond with valid SysML v2 code wrapped in a \`\`\`sysml code block.

Key SysML v2 syntax rules:
- Use \`package\` for top-level namespaces
- Use \`part def\` for part definitions (block definitions)
- Use \`part\` for part usages (instances)
- Use \`attribute\` for attributes with types (e.g., \`attribute mass : Real;\`)
- Use \`port def\` / \`port\` for port definitions/usages
- Use \`interface def\` / \`interface\` for interface definitions/usages
- Use \`connection def\` / \`connection\` for connections
- Use \`action def\` / \`action\` for behavior
- Use \`state def\` / \`state\` for state machines
- Use \`requirement def\` / \`requirement\` for requirements
- Use \`constraint def\` / \`constraint\` for constraints
- Use \`allocation def\` / \`allocation\` for allocations
- Use \`flow connection def\` for flow connections
- Use \`item def\` / \`item\` for items
- Use \`enum def\` for enumerations
- Use \`doc /* ... */\` for documentation comments
- Use \`:>\` for specialization (subtyping)
- Use \`:\` for typing
- Use \`import\` for importing elements

Always produce complete, valid SysML v2 code. If the user asks a question about SysML, explain it clearly.
Respond in the same language as the user's input (Chinese or English).`;

/* ------------------------------------------------------------------ */
/*  Provider configuration                                            */
/* ------------------------------------------------------------------ */

const PROVIDER_PRESETS: Record<AIProvider, { label: string; model: string; baseUrl?: string }> = {
  gemini: {
    label: 'Gemini',
    model: 'gemini-2.0-flash',
  },
  deepseek: {
    label: 'DeepSeek',
    model: 'deepseek-chat',
    baseUrl: 'https://api.deepseek.com/v1/chat/completions',
  },
  qwen: {
    label: 'Qwen',
    model: 'qwen-plus',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
  },
  'openai-compatible': {
    label: 'OpenAI 兼容',
    model: 'gpt-4o-mini',
    baseUrl: 'https://api.openai.com/v1/chat/completions',
  },
};

const AI_SETTINGS_KEY = 'easy-sysml.ai-settings';

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

let _aiClient: GoogleGenAI | null = null;
let _aiClientKey = '';

function getEnvValue(name: string): string {
  if (typeof process === 'undefined') return '';
  const value = (process as { env?: Record<string, string | undefined> }).env?.[name];
  return typeof value === 'string' ? value : '';
}

function isConfiguredValue(value?: string): boolean {
  if (!value) return false;
  return !/^MY_[A-Z0-9_]+$/.test(value.trim());
}

function getDefaultProvider(): AIProvider {
  const explicit = getEnvValue('AI_PROVIDER');
  if (explicit === 'gemini' || explicit === 'deepseek' || explicit === 'qwen' || explicit === 'openai-compatible') {
    return explicit;
  }
  if (isConfiguredValue(getEnvValue('GEMINI_API_KEY'))) return 'gemini';
  if (isConfiguredValue(getEnvValue('DEEPSEEK_API_KEY'))) return 'deepseek';
  if (isConfiguredValue(getEnvValue('QWEN_API_KEY'))) return 'qwen';
  if (isConfiguredValue(getEnvValue('OPENAI_API_KEY'))) return 'openai-compatible';
  return 'gemini';
}

function getDefaultSettings(): AISettings {
  const provider = getDefaultProvider();
  return {
    provider,
    apiKeys: {
      gemini: getEnvValue('GEMINI_API_KEY'),
      deepseek: getEnvValue('DEEPSEEK_API_KEY'),
      qwen: getEnvValue('QWEN_API_KEY'),
      'openai-compatible': getEnvValue('OPENAI_API_KEY'),
    },
    model: getEnvValue('AI_MODEL') || PROVIDER_PRESETS[provider].model,
    baseUrl: getEnvValue('AI_BASE_URL') || PROVIDER_PRESETS[provider].baseUrl || '',
  };
}

function loadAISettings(): AISettings {
  const defaults = getDefaultSettings();
  if (typeof window === 'undefined') return defaults;

  try {
    const raw = window.localStorage.getItem(AI_SETTINGS_KEY);
    if (!raw) return defaults;

    const parsed = JSON.parse(raw) as Partial<AISettings>;
    return {
      provider:
        parsed.provider === 'gemini'
        || parsed.provider === 'deepseek'
        || parsed.provider === 'qwen'
        || parsed.provider === 'openai-compatible'
          ? parsed.provider
          : defaults.provider,
      apiKeys: {
        ...defaults.apiKeys,
        ...(parsed.apiKeys || {}),
      },
      model: typeof parsed.model === 'string' && parsed.model.trim()
        ? parsed.model
        : defaults.model,
      baseUrl: typeof parsed.baseUrl === 'string'
        ? parsed.baseUrl
        : defaults.baseUrl,
    };
  } catch {
    return defaults;
  }
}

function saveAISettings(settings: AISettings): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(AI_SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Ignore storage failures.
  }
}

function getAIClient(apiKey: string): GoogleGenAI | null {
  if (!isConfiguredValue(apiKey)) return null;
  if (_aiClient && _aiClientKey === apiKey) return _aiClient;
  _aiClientKey = apiKey;
  _aiClient = new GoogleGenAI({ apiKey });
  return _aiClient;
}

function isAIAvailable(settings: AISettings): boolean {
  const apiKey = settings.apiKeys[settings.provider];
  if (!isConfiguredValue(apiKey)) return false;
  if (settings.provider === 'gemini') return true;
  return !!settings.baseUrl.trim();
}

function getProviderHelpText(provider: AIProvider): string {
  switch (provider) {
    case 'deepseek':
      return '使用 DeepSeek 官方 OpenAI 兼容接口。';
    case 'qwen':
      return '使用阿里云 DashScope 的 OpenAI 兼容模式。';
    case 'openai-compatible':
      return '可填写任意兼容 OpenAI Chat Completions 的地址。';
    default:
      return '使用 Google Gemini 原生接口。';
  }
}

async function generateAIResponse(settings: AISettings, userText: string, currentCode?: string): Promise<string> {
  const apiKey = settings.apiKeys[settings.provider]?.trim();
  if (!isConfiguredValue(apiKey)) {
    throw new Error('请先配置所选模型提供商的 API Key。');
  }

  if (settings.provider === 'gemini') {
    const client = getAIClient(apiKey);
    if (!client) {
      throw new Error('Gemini API Key 无效或未配置。');
    }

    const contextParts: string[] = [SYSTEM_PROMPT];
    if (currentCode) {
      contextParts.push(`\nThe user's current SysML v2 model is:\n\`\`\`sysml\n${currentCode}\n\`\`\``);
    }

    const response = await client.models.generateContent({
      model: settings.model || PROVIDER_PRESETS.gemini.model,
      contents: [
        { role: 'user', parts: [{ text: `${contextParts.join('\n')}\n\nUser request: ${userText}` }] },
      ],
    });

    return response?.text ?? '';
  }

  if (!settings.baseUrl.trim()) {
    throw new Error('请先配置兼容 OpenAI 的接口地址。');
  }

  const response = await fetch(settings.baseUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: settings.model || PROVIDER_PRESETS[settings.provider].model,
      temperature: 0.3,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        ...(currentCode
          ? [{ role: 'user', content: `The user's current SysML v2 model is:\n\`\`\`sysml\n${currentCode}\n\`\`\`` }]
          : []),
        { role: 'user', content: userText },
      ],
    }),
  });

  const rawText = await response.text();
  let payload: any = null;

  try {
    payload = rawText ? JSON.parse(rawText) : null;
  } catch {
    if (!response.ok) {
      throw new Error(`AI 请求失败 (${response.status})`);
    }
    throw new Error('AI 返回了无法解析的内容。');
  }

  if (!response.ok) {
    const message = payload?.error?.message || payload?.message || `AI 请求失败 (${response.status})`;
    throw new Error(message);
  }

  const text = payload?.choices?.[0]?.message?.content;
  if (typeof text !== 'string' || !text.trim()) {
    throw new Error('AI 返回为空，请检查模型名称和接口地址。');
  }

  return text;
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

let _nextId = 0;
function makeId(): string {
  return `msg-${Date.now()}-${_nextId++}`;
}

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
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState<AISettings>(() => loadAISettings());
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const providerMeta = PROVIDER_PRESETS[settings.provider];
  const currentApiKey = settings.apiKeys[settings.provider] || '';
  const aiAvailable = isAIAvailable(settings);

  useEffect(() => {
    saveAISettings(settings);
  }, [settings]);

  useEffect(() => {
    if (!aiAvailable) {
      setShowSettings(true);
    }
  }, [aiAvailable]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  const handleProviderChange = useCallback((provider: AIProvider) => {
    setSettings(prev => ({
      ...prev,
      provider,
      model: PROVIDER_PRESETS[provider].model,
      baseUrl: PROVIDER_PRESETS[provider].baseUrl || '',
    }));
  }, []);

  const handleSend = useCallback(async (text?: string) => {
    const userText = (text ?? input).trim();
    if (!userText || loading || !aiAvailable) return;
    setInput('');

    const userMsg: ChatMessage = {
      id: makeId(),
      role: 'user',
      content: userText,
      codeBlocks: [],
      timestamp: Date.now(),
    };
    setMessages(prev => [...prev, userMsg]);
    setLoading(true);

    try {
      const responseText = await generateAIResponse(settings, userText, currentCode);
      const codeBlocks = extractCodeBlocks(responseText);

      const assistantMsg: ChatMessage = {
        id: makeId(),
        role: 'assistant',
        content: responseText,
        provider: providerMeta.label,
        codeBlocks,
        timestamp: Date.now(),
      };
      setMessages(prev => [...prev, assistantMsg]);
    } catch (err: any) {
      const errorMsg: ChatMessage = {
        id: makeId(),
        role: 'error',
        content: err.message || '生成失败，请稍后重试。',
        provider: providerMeta.label,
        codeBlocks: [],
        timestamp: Date.now(),
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setLoading(false);
    }
  }, [aiAvailable, currentCode, input, loading, providerMeta.label, settings]);

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
          <button
            onClick={() => setShowSettings(v => !v)}
            className="px-2 py-1 rounded border border-[var(--border-color)] text-[9px] font-bold text-[var(--text-muted)] hover:text-[var(--text-main)] hover:border-purple-500/50 transition-colors"
            title="API 设置"
          >
            {providerMeta.label}
          </button>
          <button
            onClick={handleNewChat}
            className="p-1 hover:bg-[var(--border-color)] rounded text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors"
            title="新对话"
          >
            <Plus size={14} />
          </button>
        </div>
      </div>

      {showSettings && (
        <div className="border-b border-[var(--border-color)] p-2 bg-[var(--bg-main)]/50 space-y-2">
          <div className="grid grid-cols-1 gap-2">
            <select
              value={settings.provider}
              onChange={e => handleProviderChange(e.target.value as AIProvider)}
              className="bg-[var(--bg-main)] border border-[var(--border-color)] rounded-lg px-2.5 py-2 text-[11px] text-[var(--text-main)] focus:outline-none focus:border-purple-500"
            >
              {Object.entries(PROVIDER_PRESETS).map(([value, meta]) => (
                <option key={value} value={value}>{meta.label}</option>
              ))}
            </select>

            <input
              type="password"
              value={currentApiKey}
              onChange={e => setSettings(prev => ({
                ...prev,
                apiKeys: {
                  ...prev.apiKeys,
                  [prev.provider]: e.target.value,
                },
              }))}
              placeholder="输入 API Key"
              className="bg-[var(--bg-main)] border border-[var(--border-color)] rounded-lg px-2.5 py-2 text-[11px] text-[var(--text-main)] focus:outline-none focus:border-purple-500"
            />

            <input
              value={settings.model}
              onChange={e => setSettings(prev => ({ ...prev, model: e.target.value }))}
              placeholder="模型名称"
              className="bg-[var(--bg-main)] border border-[var(--border-color)] rounded-lg px-2.5 py-2 text-[11px] text-[var(--text-main)] focus:outline-none focus:border-purple-500"
            />

            {settings.provider !== 'gemini' && (
              <input
                value={settings.baseUrl}
                onChange={e => setSettings(prev => ({ ...prev, baseUrl: e.target.value }))}
                placeholder="OpenAI 兼容接口地址"
                className="bg-[var(--bg-main)] border border-[var(--border-color)] rounded-lg px-2.5 py-2 text-[11px] text-[var(--text-main)] focus:outline-none focus:border-purple-500"
              />
            )}
          </div>

          <div className="text-[10px] text-[var(--text-muted)] leading-relaxed">
            {getProviderHelpText(settings.provider)} 配置会保存在当前浏览器本地。
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
                支持 Gemini、DeepSeek、Qwen 和自定义兼容接口
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
              <div key={msg.id} className={cn(
                'rounded-lg p-3',
                msg.role === 'user'
                  ? 'bg-blue-500/10 border border-blue-500/20 ml-4'
                  : msg.role === 'error'
                    ? 'bg-red-500/10 border border-red-500/20'
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
                  ) : (
                    <>
                      <Sparkles size={10} className="text-purple-500" />
                      <span className="text-[9px] font-bold text-purple-500 uppercase">
                        {msg.provider || 'AI'}
                      </span>
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
            ))}

            {/* Loading indicator */}
            {loading && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-[var(--bg-main)] border border-[var(--border-color)]">
                <Loader2 size={14} className="text-purple-500 animate-spin" />
                <span className="text-[11px] text-[var(--text-muted)]">{providerMeta.label} 正在生成...</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Input area */}
      <div className="border-t border-[var(--border-color)] p-2 flex-shrink-0">
        {!aiAvailable && (
          <div className="mb-2 flex items-center gap-1.5 px-2 py-1.5 rounded bg-amber-500/10 border border-amber-500/20">
            <AlertCircle size={12} className="text-amber-500 flex-shrink-0" />
            <span className="text-[10px] text-amber-600 dark:text-amber-400">
              请先配置 API Key，已支持 Gemini / DeepSeek / Qwen / OpenAI 兼容接口
            </span>
          </div>
        )}
        <div className="flex items-end gap-1.5">
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={aiAvailable ? `描述您想要的模型（当前：${providerMeta.label}）...` : '请先配置 API Key'}
            disabled={loading || !aiAvailable}
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
            disabled={loading || !input.trim() || !aiAvailable}
            className={cn(
              'p-2 rounded-lg transition-all flex-shrink-0',
              input.trim() && aiAvailable
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
