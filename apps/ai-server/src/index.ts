/**
 * AI Agent Server — Main Entry Point
 *
 * Express server providing a Copilot-style AI agent for SysML v2 modeling.
 * Uses Vercel AI SDK (`ai` package) for:
 *   - Native tool calling via the model's tools API (MCP-style)
 *   - Multi-step agent loops with `maxSteps`
 *   - Streaming text + tool results via SSE
 *
 * SSE Event Types sent to the frontend:
 *   delta      — streaming text chunk (markdown content)
 *   code       — complete SysML code block extracted from response
 *   tool_call  — tool invocation details (name, status, result)
 *   error      — error message
 *   done       — stream complete
 */

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { streamText, stepCountIs } from 'ai';
import {
  getProvider, getApiKey, getModelId, PROVIDER_PRESETS,
  createModel,
} from './provider.js';
import { mcpTools, validateSysML } from './tools.js';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

/* ------------------------------------------------------------------ */
/*  System prompt                                                     */
/* ------------------------------------------------------------------ */

const SYSTEM_PROMPT = `You are a professional SysML v2 modeling agent integrated into an MBSE workbench IDE, similar to GitHub Copilot.

You have access to MCP tools that you MUST use:
1. **validate_sysml** — ALWAYS call this after generating any SysML v2 code. If validation fails, fix the errors and re-validate.
2. **get_stdlib_types** — Use this to look up available standard library types when needed.

Your workflow:
1. Analyze the user's request
2. Generate SysML v2 code in a \`\`\`sysml code block
3. Call validate_sysml to verify the code
4. If validation fails, fix the errors and re-validate
5. Provide explanation alongside the code

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
    const model = createModel(provider);

    // Build messages array
    const systemMessages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      { role: 'system', content: SYSTEM_PROMPT },
    ];

    if (currentCode?.trim()) {
      systemMessages.push({
        role: 'system',
        content: `The user's current SysML v2 code in the editor:\n\`\`\`sysml\n${currentCode}\n\`\`\``,
      });
    }

    const fullMessages = [...systemMessages, ...messages];

    // Use Vercel AI SDK streamText with MCP tools and multi-step agent loop
    const result = streamText({
      model,
      messages: fullMessages,
      tools: mcpTools,
      stopWhen: stepCountIs(5), // Agent can call tools across up to 5 steps
      temperature: 0.3,
      experimental_onToolCallStart: ({ toolCall }) => {
        sseWrite(res, 'tool_call', {
          name: toolCall.toolName,
          args: 'input' in toolCall ? toolCall.input : {},
          status: 'running',
        });
      },
      experimental_onToolCallFinish: (event) => {
        if (event.success) {
          sseWrite(res, 'tool_call', {
            name: event.toolCall.toolName,
            args: 'input' in event.toolCall ? event.toolCall.input : {},
            status: 'completed',
            result: typeof event.output === 'string'
              ? event.output
              : JSON.stringify(event.output).slice(0, 200),
          });
        } else {
          sseWrite(res, 'tool_call', {
            name: event.toolCall.toolName,
            args: {},
            status: 'error',
            result: event.error instanceof Error ? event.error.message : 'Tool call failed',
          });
        }
      },
    });

    // Stream text deltas and detect code blocks
    let fullText = '';
    let inCodeBlock = false;
    let codeBuffer = '';
    let proseBuffer = '';

    for await (const chunk of result.textStream) {
      fullText += chunk;

      // Detect code block boundaries
      const combined = (inCodeBlock ? codeBuffer : proseBuffer) + chunk;

      if (!inCodeBlock) {
        proseBuffer += chunk;
        // Check for code block start
        const startMatch = proseBuffer.match(/```(?:sysml|kerml)?\s*\n/);
        if (startMatch && startMatch.index !== undefined) {
          // Send prose before the code block
          const before = proseBuffer.slice(0, startMatch.index);
          if (before.trim()) {
            sseWrite(res, 'delta', { content: before });
          }
          inCodeBlock = true;
          codeBuffer = proseBuffer.slice(startMatch.index + startMatch[0].length);
          proseBuffer = '';
        } else {
          // Send complete lines as deltas
          const lastNewline = proseBuffer.lastIndexOf('\n');
          if (lastNewline >= 0) {
            const complete = proseBuffer.slice(0, lastNewline + 1);
            proseBuffer = proseBuffer.slice(lastNewline + 1);
            if (complete) {
              sseWrite(res, 'delta', { content: complete });
            }
          }
        }
      } else {
        codeBuffer += chunk;
        // Check for code block end
        const endIdx = codeBuffer.indexOf('```');
        if (endIdx >= 0) {
          const codeContent = codeBuffer.slice(0, endIdx).trim();
          proseBuffer = codeBuffer.slice(endIdx + 3);
          codeBuffer = '';
          inCodeBlock = false;

          // Emit code event
          if (codeContent) {
            sseWrite(res, 'code', {
              content: codeContent,
              language: 'sysml',
              autoApply,
            });
          }
        }
      }
    }

    // Flush remaining prose
    if (proseBuffer.trim()) {
      sseWrite(res, 'delta', { content: proseBuffer });
    }

    sseWrite(res, 'done', {});
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
    model: getModelId(provider),
    configured: !!apiKey,
    tools: Object.keys(mcpTools),
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
    const { getStdlibFiles } = await import('@easy-sysml/language-server');
    const files: string[] = getStdlibFiles();
    const filtered = category
      ? files.filter((f: string) => f.toLowerCase().includes(category.toLowerCase()))
      : files;
    res.json({ types: filtered });
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
  console.log(`[AI Agent Server] Provider: ${preset.label} (${getModelId(provider)})`);
  console.log(`[AI Agent Server] API Key: ${getApiKey(provider) ? '✓ configured' : '✗ missing'}`);
  console.log(`[AI Agent Server] Tools: ${Object.keys(mcpTools).join(', ')}`);
  console.log(`[AI Agent Server] Agent mode: maxSteps=5 (multi-step tool calling)`);
});
