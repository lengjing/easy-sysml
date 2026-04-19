/**
 * AI Agent Backend Server
 *
 * Provides a streaming SSE endpoint for AI-powered SysML v2 modeling
 * assistance. Supports Gemini, DeepSeek, Qwen, and OpenAI-compatible APIs.
 *
 * Environment variables:
 *   AI_PROVIDER   — gemini | deepseek | qwen | openai-compatible
 *   GEMINI_API_KEY / DEEPSEEK_API_KEY / QWEN_API_KEY / OPENAI_API_KEY
 *   AI_MODEL      — model name (default: per-provider preset)
 *   AI_BASE_URL   — custom endpoint for OpenAI-compatible providers
 *   PORT          — server port (default: 3001)
 */
import express from 'express';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(express.json({ limit: '1mb' }));

/* ------------------------------------------------------------------ */
/*  Provider configuration                                            */
/* ------------------------------------------------------------------ */

type AIProvider = 'gemini' | 'deepseek' | 'qwen' | 'openai-compatible';

interface ProviderPreset {
  label: string;
  model: string;
  baseUrl?: string;
}

const PROVIDER_PRESETS: Record<AIProvider, ProviderPreset> = {
  gemini: { label: 'Gemini', model: 'gemini-2.0-flash' },
  deepseek: { label: 'DeepSeek', model: 'deepseek-chat', baseUrl: 'https://api.deepseek.com/v1/chat/completions' },
  qwen: { label: 'Qwen', model: 'qwen-plus', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions' },
  'openai-compatible': { label: 'OpenAI 兼容', model: 'gpt-4o-mini', baseUrl: 'https://api.openai.com/v1/chat/completions' },
};

const API_KEY_MAP: Record<AIProvider, string> = {
  gemini: 'GEMINI_API_KEY',
  deepseek: 'DEEPSEEK_API_KEY',
  qwen: 'QWEN_API_KEY',
  'openai-compatible': 'OPENAI_API_KEY',
};

function getProvider(): AIProvider {
  const p = process.env.AI_PROVIDER;
  if (p === 'gemini' || p === 'deepseek' || p === 'qwen' || p === 'openai-compatible') return p;
  if (process.env.GEMINI_API_KEY) return 'gemini';
  if (process.env.DEEPSEEK_API_KEY) return 'deepseek';
  if (process.env.QWEN_API_KEY) return 'qwen';
  if (process.env.OPENAI_API_KEY) return 'openai-compatible';
  return 'gemini';
}

function getApiKey(provider: AIProvider): string {
  return process.env[API_KEY_MAP[provider]] ?? '';
}

function getModel(provider: AIProvider): string {
  return process.env.AI_MODEL || PROVIDER_PRESETS[provider].model;
}

function getBaseUrl(provider: AIProvider): string {
  return process.env.AI_BASE_URL || PROVIDER_PRESETS[provider].baseUrl || '';
}

/* ------------------------------------------------------------------ */
/*  System prompt                                                     */
/* ------------------------------------------------------------------ */

const SYSTEM_PROMPT = `You are a professional SysML v2 modeling assistant integrated into an MBSE workbench IDE. You function like GitHub Copilot — an AI agent specialized in SysML v2 modeling.

Your capabilities:
1. **Code Generation**: Generate complete, valid SysML v2 code
2. **Code Modification**: Modify existing SysML v2 models based on user requests
3. **Model Analysis**: Analyze and explain SysML v2 models
4. **Best Practices**: Suggest modeling improvements and design patterns

When generating or modifying code, ALWAYS wrap SysML v2 code in \`\`\`sysml code blocks.

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

Always produce complete, valid SysML v2 code. If the user asks a question, explain clearly.
Respond in the same language as the user's input (Chinese or English).
When you need to think through a problem, share your reasoning process.`;

/* ------------------------------------------------------------------ */
/*  Gemini client singleton                                           */
/* ------------------------------------------------------------------ */

let _geminiClient: GoogleGenAI | null = null;
let _geminiKey = '';

function getGeminiClient(apiKey: string): GoogleGenAI {
  if (_geminiClient && _geminiKey === apiKey) return _geminiClient;
  _geminiKey = apiKey;
  _geminiClient = new GoogleGenAI({ apiKey });
  return _geminiClient;
}

/* ------------------------------------------------------------------ */
/*  SSE helpers                                                       */
/* ------------------------------------------------------------------ */

function sseWrite(res: express.Response, event: string, data: unknown) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

/* ------------------------------------------------------------------ */
/*  POST /api/chat  — streaming SSE                                   */
/* ------------------------------------------------------------------ */

interface ChatRequest {
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  currentCode?: string;
  /** If true, auto-apply first code block to editor. */
  autoApply?: boolean;
}

app.post('/api/chat', async (req: express.Request, res: express.Response) => {
  const { messages, currentCode, autoApply } = req.body as ChatRequest;

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ error: 'messages array is required' });
    return;
  }

  const provider = getProvider();
  const apiKey = getApiKey(provider);
  const model = getModel(provider);
  const preset = PROVIDER_PRESETS[provider];

  if (!apiKey) {
    res.status(500).json({ error: `未配置 ${preset.label} API Key (${API_KEY_MAP[provider]})` });
    return;
  }

  // SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  const lastUserMsg = messages[messages.length - 1]?.content ?? '';

  try {
    // Send thinking step
    sseWrite(res, 'thinking', {
      content: `正在使用 ${preset.label} (${model}) 分析您的请求...`,
    });

    // Analyze what the user wants
    const hasCodeContext = !!currentCode?.trim();
    if (hasCodeContext) {
      sseWrite(res, 'thinking', {
        content: '已加载编辑器中的当前代码作为上下文',
      });
    }

    // Determine task type
    const isCodeGen = /创建|生成|添加|定义|修改|编写|写|implement|create|add|define|modify|write|build/i.test(lastUserMsg);
    const isAnalysis = /分析|解释|说明|什么|why|what|explain|analyze|describe/i.test(lastUserMsg);

    if (isCodeGen) {
      sseWrite(res, 'thinking', { content: '任务类型：代码生成 — 正在构建 SysML v2 模型...' });
    } else if (isAnalysis) {
      sseWrite(res, 'thinking', { content: '任务类型：模型分析 — 正在分析模型结构...' });
    } else {
      sseWrite(res, 'thinking', { content: '正在处理您的请求...' });
    }

    // Build full response
    let fullText: string;

    if (provider === 'gemini') {
      const client = getGeminiClient(apiKey);

      const contextParts: string[] = [SYSTEM_PROMPT];
      if (hasCodeContext) {
        contextParts.push(`\nThe user's current SysML v2 model is:\n\`\`\`sysml\n${currentCode}\n\`\`\``);
      }

      // Build Gemini contents from conversation history
      const geminiContents = messages.map(m => ({
        role: m.role === 'assistant' ? ('model' as const) : ('user' as const),
        parts: [{ text: m.content }],
      }));

      // Prepend system context to first user message
      if (geminiContents.length > 0 && geminiContents[0].role === 'user') {
        geminiContents[0] = {
          ...geminiContents[0],
          parts: [{ text: `${contextParts.join('\n')}\n\nUser request: ${geminiContents[0].parts[0].text}` }],
        };
      }

      sseWrite(res, 'thinking', { content: `正在调用 ${preset.label} API...` });

      const response = await client.models.generateContent({
        model,
        contents: geminiContents,
      });

      fullText = response?.text ?? '';
    } else {
      // OpenAI-compatible path (DeepSeek, Qwen, etc.)
      const baseUrl = getBaseUrl(provider);
      if (!baseUrl) {
        sseWrite(res, 'error', { content: '未配置 API 接口地址' });
        res.end();
        return;
      }

      const apiMessages = [
        { role: 'system', content: SYSTEM_PROMPT },
        ...(hasCodeContext
          ? [{ role: 'user', content: `The user's current SysML v2 model is:\n\`\`\`sysml\n${currentCode}\n\`\`\`` }]
          : []),
        ...messages,
      ];

      sseWrite(res, 'thinking', { content: `正在调用 ${preset.label} API...` });

      const apiResponse = await fetch(baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          temperature: 0.3,
          messages: apiMessages,
        }),
      });

      if (!apiResponse.ok) {
        const errText = await apiResponse.text();
        let errMsg: string;
        try {
          const errJson = JSON.parse(errText);
          errMsg = errJson?.error?.message || errJson?.message || `API 请求失败 (${apiResponse.status})`;
        } catch {
          errMsg = `API 请求失败 (${apiResponse.status})`;
        }
        sseWrite(res, 'error', { content: errMsg });
        res.end();
        return;
      }

      const payload = await apiResponse.json() as { choices?: Array<{ message?: { content?: string } }> };
      fullText = payload?.choices?.[0]?.message?.content ?? '';
    }

    if (!fullText.trim()) {
      sseWrite(res, 'error', { content: 'AI 返回为空，请检查模型配置。' });
      res.end();
      return;
    }

    // Extract code blocks
    const codeBlocks: string[] = [];
    const codeRegex = /```(?:sysml|kerml)?\s*\n([\s\S]*?)```/g;
    let match;
    while ((match = codeRegex.exec(fullText)) !== null) {
      codeBlocks.push(match[1].trim());
    }

    if (codeBlocks.length > 0) {
      sseWrite(res, 'thinking', { content: `生成了 ${codeBlocks.length} 个代码块` });
      if (autoApply) {
        sseWrite(res, 'thinking', { content: '代码将自动同步到编辑器' });
      }
    }

    // Send the response
    sseWrite(res, 'response', {
      content: fullText,
      codeBlocks,
      autoApply: autoApply && codeBlocks.length > 0,
      provider: preset.label,
    });

    sseWrite(res, 'done', {});
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : '生成失败，请稍后重试。';
    sseWrite(res, 'error', { content: message });
  } finally {
    res.end();
  }
});

/* ------------------------------------------------------------------ */
/*  GET /api/status                                                   */
/* ------------------------------------------------------------------ */

app.get('/api/status', (_req: express.Request, res: express.Response) => {
  const provider = getProvider();
  const apiKey = getApiKey(provider);
  const preset = PROVIDER_PRESETS[provider];

  res.json({
    ok: true,
    provider: provider,
    providerLabel: preset.label,
    model: getModel(provider),
    configured: !!apiKey,
  });
});

/* ------------------------------------------------------------------ */
/*  Start                                                             */
/* ------------------------------------------------------------------ */

const PORT = parseInt(process.env.PORT || '3001', 10);
app.listen(PORT, () => {
  const provider = getProvider();
  const preset = PROVIDER_PRESETS[provider];
  console.log(`[AI Server] Running on http://localhost:${PORT}`);
  console.log(`[AI Server] Provider: ${preset.label} (${getModel(provider)})`);
  console.log(`[AI Server] API Key: ${getApiKey(provider) ? '✓ configured' : '✗ missing'}`);
});
