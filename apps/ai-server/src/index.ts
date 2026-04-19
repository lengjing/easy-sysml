/**
 * AI Agent Server — Main Entry Point
 *
 * Express server providing a Copilot-like AI agent for SysML v2 modeling.
 *
 * Key Features:
 * - True token-by-token SSE streaming
 * - Agent mode with tool calling (grammar validation, stdlib lookup)
 * - Auto-validates generated SysML code and retries on syntax errors
 * - Streaming markdown + code blocks separated in SSE events
 *
 * SSE Event Types:
 *   thinking  — agent thinking / tool invocation status
 *   delta     — streaming text chunk (markdown content)
 *   code      — complete code block extracted and validated
 *   tool_call — tool invocation details (name, args, result)
 *   error     — error message
 *   done      — stream complete
 */

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import {
  getProvider, getApiKey, getModel, PROVIDER_PRESETS,
  streamChatResponse,
  type ChatMessage,
} from './provider.js';
import { validateSysML, getStdlibTypes } from './tools.js';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

/* ------------------------------------------------------------------ */
/*  System prompt                                                     */
/* ------------------------------------------------------------------ */

const SYSTEM_PROMPT = `You are a professional SysML v2 modeling agent integrated into an MBSE workbench IDE, similar to GitHub Copilot.

You have access to these tools:
1. **validate_sysml** — Validates SysML v2 code for syntax correctness using the real SysML v2 parser
2. **get_stdlib_types** — Queries the SysML v2 standard library for available types and definitions

Your workflow:
1. Analyze the user's request
2. Generate SysML v2 code
3. The system will automatically validate your code
4. If validation fails, you will be told the errors and must fix them
5. Repeat until the code is valid

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

IMPORTANT: Always wrap SysML v2 code in \`\`\`sysml code blocks.
Respond in the same language as the user's input (Chinese or English).
When you need to think through a problem, share your reasoning.`;

/* ------------------------------------------------------------------ */
/*  SSE helpers                                                       */
/* ------------------------------------------------------------------ */

function sseWrite(res: express.Response, event: string, data: unknown) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

/* ------------------------------------------------------------------ */
/*  Code extraction                                                   */
/* ------------------------------------------------------------------ */

function extractCodeBlocks(text: string): string[] {
  const blocks: string[] = [];
  const regex = /```(?:sysml|kerml)?\s*\n([\s\S]*?)```/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    blocks.push(match[1].trim());
  }
  return blocks;
}

/**
 * Remove code blocks from text, returning only the markdown prose.
 */
function stripCodeBlocks(text: string): string {
  return text.replace(/```(?:sysml|kerml)?\s*\n[\s\S]*?```/g, '').trim();
}

/* ------------------------------------------------------------------ */
/*  Agent loop                                                        */
/* ------------------------------------------------------------------ */

const MAX_RETRIES = 2;

interface AgentContext {
  res: express.Response;
  messages: ChatMessage[];
  currentCode?: string;
  autoApply: boolean;
}

async function runAgent(ctx: AgentContext): Promise<void> {
  const { res, messages, currentCode, autoApply } = ctx;
  const provider = getProvider();
  const preset = PROVIDER_PRESETS[provider];
  const model = getModel(provider);

  sseWrite(res, 'thinking', {
    content: `使用 ${preset.label} (${model}) 分析请求...`,
  });

  // Build the conversation
  const fullMessages: ChatMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
  ];

  if (currentCode?.trim()) {
    fullMessages.push({
      role: 'system',
      content: `用户编辑器中的当前 SysML v2 代码:\n\`\`\`sysml\n${currentCode}\n\`\`\``,
    });
    sseWrite(res, 'thinking', { content: '已加载编辑器中的当前代码作为上下文' });
  }

  fullMessages.push(...messages);

  // First AI call — stream tokens
  let fullText = '';
  let currentCodeBlock = '';
  let inCodeBlock = false;
  let codeBlockLang = '';

  sseWrite(res, 'thinking', { content: '正在生成...' });

  try {
    fullText = await streamChatResponse(fullMessages, (chunk: string) => {
      // Detect code block boundaries in the streaming text
      // We accumulate chunks and detect ```sysml ... ``` boundaries
      currentCodeBlock += chunk;

      // Check for code block start
      if (!inCodeBlock) {
        const startMatch = currentCodeBlock.match(/```(sysml|kerml)?\s*\n/);
        if (startMatch) {
          // Send everything before the code block as markdown delta
          const beforeCode = currentCodeBlock.slice(0, startMatch.index);
          if (beforeCode.trim()) {
            sseWrite(res, 'delta', { content: beforeCode });
          }
          inCodeBlock = true;
          codeBlockLang = startMatch[1] || 'sysml';
          currentCodeBlock = currentCodeBlock.slice((startMatch.index ?? 0) + startMatch[0].length);
          sseWrite(res, 'thinking', { content: `正在生成 ${codeBlockLang.toUpperCase()} 代码...` });
          return;
        }
        // No code block — send as delta
        // But only send complete lines to avoid partial markdown
        const lastNewline = currentCodeBlock.lastIndexOf('\n');
        if (lastNewline >= 0) {
          const complete = currentCodeBlock.slice(0, lastNewline + 1);
          currentCodeBlock = currentCodeBlock.slice(lastNewline + 1);
          if (complete) {
            sseWrite(res, 'delta', { content: complete });
          }
        }
      } else {
        // Inside code block — check for end
        const endIdx = currentCodeBlock.indexOf('```');
        if (endIdx >= 0) {
          const codeContent = currentCodeBlock.slice(0, endIdx).trim();
          currentCodeBlock = currentCodeBlock.slice(endIdx + 3);
          inCodeBlock = false;
          // Emit code event (will be validated below)
          sseWrite(res, 'code', {
            content: codeContent,
            language: codeBlockLang,
            autoApply,
          });
        }
      }
    });

    // Flush remaining buffer
    if (currentCodeBlock.trim()) {
      sseWrite(res, 'delta', { content: currentCodeBlock });
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'AI 调用失败';
    sseWrite(res, 'error', { content: message });
    return;
  }

  // Extract all code blocks for validation
  const codeBlocks = extractCodeBlocks(fullText);

  if (codeBlocks.length === 0) {
    // No code to validate — we're done
    sseWrite(res, 'done', {});
    return;
  }

  // Validate each code block
  for (let i = 0; i < codeBlocks.length; i++) {
    const code = codeBlocks[i];
    sseWrite(res, 'tool_call', {
      name: 'validate_sysml',
      args: { code: code.slice(0, 100) + (code.length > 100 ? '...' : '') },
      status: 'running',
    });

    try {
      const result = await validateSysML(code);

      sseWrite(res, 'tool_call', {
        name: 'validate_sysml',
        args: {},
        status: 'completed',
        result: result.summary,
      });

      if (!result.valid && result.diagnostics.length > 0) {
        // Code has errors — try to fix
        const errorDetails = result.diagnostics
          .filter(d => d.severity === 'error')
          .map(d => `Line ${d.line}:${d.column}: ${d.message}`)
          .join('\n');

        sseWrite(res, 'thinking', {
          content: `发现语法错误，正在自动修复...\n${result.summary}`,
        });

        // Retry: ask AI to fix
        let retriesLeft = MAX_RETRIES;
        let fixedCode = code;
        let lastErrors = errorDetails;

        while (retriesLeft > 0 && lastErrors) {
          retriesLeft--;

          const fixMessages: ChatMessage[] = [
            ...fullMessages,
            { role: 'assistant', content: fullText },
            {
              role: 'user',
              content: `你生成的 SysML v2 代码有语法错误，请修复:\n\n错误信息:\n${lastErrors}\n\n原始代码:\n\`\`\`sysml\n${fixedCode}\n\`\`\`\n\n请只返回修复后的完整代码（用 \`\`\`sysml 代码块包裹），不需要额外解释。`,
            },
          ];

          sseWrite(res, 'thinking', {
            content: `第 ${MAX_RETRIES - retriesLeft} 次修复尝试...`,
          });

          let fixResponse = '';
          try {
            // Collect fix response without streaming to client
            fixResponse = await streamChatResponse(fixMessages, () => {});
          } catch {
            break;
          }

          const fixedBlocks = extractCodeBlocks(fixResponse);
          if (fixedBlocks.length === 0) break;

          fixedCode = fixedBlocks[0];

          // Re-validate
          const revalidation = await validateSysML(fixedCode);

          sseWrite(res, 'tool_call', {
            name: 'validate_sysml',
            args: {},
            status: 'completed',
            result: revalidation.summary,
          });

          if (revalidation.valid) {
            // Fixed successfully
            sseWrite(res, 'thinking', { content: '✅ 代码已修复并通过语法验证' });
            // Send the fixed code
            sseWrite(res, 'code', {
              content: fixedCode,
              language: 'sysml',
              autoApply,
              fixed: true,
            });
            lastErrors = '';
            break;
          } else {
            lastErrors = revalidation.diagnostics
              .filter(d => d.severity === 'error')
              .map(d => `Line ${d.line}:${d.column}: ${d.message}`)
              .join('\n');
          }
        }

        if (lastErrors) {
          sseWrite(res, 'thinking', {
            content: '⚠️ 代码修复未完全成功，请手动检查',
          });
        }
      } else {
        sseWrite(res, 'thinking', { content: '✅ 代码通过语法验证' });
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '验证失败';
      sseWrite(res, 'tool_call', {
        name: 'validate_sysml',
        args: {},
        status: 'error',
        result: message,
      });
    }
  }

  sseWrite(res, 'done', {});
}

/* ------------------------------------------------------------------ */
/*  POST /api/chat  — streaming SSE agent                             */
/* ------------------------------------------------------------------ */

interface ChatRequest {
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  currentCode?: string;
  autoApply?: boolean;
}

app.post('/api/chat', async (req: express.Request, res: express.Response) => {
  const { messages, currentCode, autoApply = true } = req.body as ChatRequest;

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ error: 'messages array is required' });
    return;
  }

  const provider = getProvider();
  const apiKey = getApiKey(provider);
  const preset = PROVIDER_PRESETS[provider];

  if (!apiKey) {
    res.status(500).json({ error: `未配置 ${preset.label} API Key` });
    return;
  }

  // SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  try {
    await runAgent({ res, messages, currentCode, autoApply });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : '服务器错误';
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
    provider,
    providerLabel: preset.label,
    model: getModel(provider),
    configured: !!apiKey,
    tools: ['validate_sysml', 'get_stdlib_types'],
  });
});

/* ------------------------------------------------------------------ */
/*  POST /api/validate  — Direct validation endpoint                  */
/* ------------------------------------------------------------------ */

app.post('/api/validate', async (req: express.Request, res: express.Response) => {
  const { code } = req.body as { code?: string };
  if (!code?.trim()) {
    res.status(400).json({ error: 'code is required' });
    return;
  }

  try {
    const result = await validateSysML(code);
    res.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : '验证失败';
    res.status(500).json({ error: message });
  }
});

/* ------------------------------------------------------------------ */
/*  GET /api/stdlib  — Standard library query                         */
/* ------------------------------------------------------------------ */

app.get('/api/stdlib', async (req: express.Request, res: express.Response) => {
  const category = req.query.category as string | undefined;
  try {
    const types = await getStdlibTypes(category);
    res.json({ types });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : '查询失败';
    res.status(500).json({ error: message });
  }
});

/* ------------------------------------------------------------------ */
/*  Start                                                             */
/* ------------------------------------------------------------------ */

const PORT = parseInt(process.env.PORT || '3001', 10);
app.listen(PORT, () => {
  const provider = getProvider();
  const preset = PROVIDER_PRESETS[provider];
  console.log(`[AI Agent Server] Running on http://localhost:${PORT}`);
  console.log(`[AI Agent Server] Provider: ${preset.label} (${getModel(provider)})`);
  console.log(`[AI Agent Server] API Key: ${getApiKey(provider) ? '✓ configured' : '✗ missing'}`);
  console.log(`[AI Agent Server] Tools: validate_sysml, get_stdlib_types`);
});
