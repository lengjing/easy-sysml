/**
 * AI Agent Core — Shared streaming agent logic.
 *
 * Provides `runAgent()` which drives the Vercel AI SDK `streamText` loop and
 * yields typed events that callers (HTTP SSE or WebSocket) can forward to
 * their respective transports.
 *
 * Event types:
 *   thinking   — model is processing (optional status message)
 *   delta      — streaming text chunk (markdown)
 *   code       — complete SysML/KerML code block extracted from the stream
 *   tool_call  — tool invocation details (name, args, status, result)
 *   error      — error description string
 *   done       — stream complete, no payload
 */

import { streamText, stepCountIs } from 'ai';
import { createModel, getProvider } from './provider.js';
import { mcpTools } from './tools.js';
import type { AIProvider } from './provider.js';

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AgentOptions {
  messages: ChatMessage[];
  currentCode?: string;
  autoApply?: boolean;
  provider?: AIProvider;
  maxSteps?: number;
}

export type AgentEvent =
  | { type: 'thinking'; content: string }
  | { type: 'delta'; content: string }
  | { type: 'code'; content: string; language: string; autoApply: boolean }
  | { type: 'tool_call'; name: string; args: Record<string, unknown>; status: 'running' | 'completed' | 'error'; result?: string }
  | { type: 'error'; content: string }
  | { type: 'done' };

/* ------------------------------------------------------------------ */
/*  System prompt                                                     */
/* ------------------------------------------------------------------ */

export const SYSTEM_PROMPT = `You are a professional SysML v2 modeling agent integrated into an MBSE workbench IDE, similar to GitHub Copilot.

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
/*  Code extraction helper                                            */
/* ------------------------------------------------------------------ */

export function extractCodeBlocks(text: string): string[] {
  const blocks: string[] = [];
  const regex = /```(?:sysml|kerml)?\s*\n([\s\S]*?)```/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    blocks.push(match[1].trim());
  }
  return blocks;
}

/* ------------------------------------------------------------------ */
/*  Core agent runner (async generator)                               */
/* ------------------------------------------------------------------ */

/**
 * Run the multi-step AI agent and yield structured events.
 * Callers iterate with `for await (const event of runAgent(opts))`.
 */
export async function* runAgent(opts: AgentOptions): AsyncGenerator<AgentEvent> {
  const {
    messages,
    currentCode,
    autoApply = true,
    provider: providerOverride,
    maxSteps: maxStepsOverride,
  } = opts;

  const provider = providerOverride ?? getProvider();
  const maxSteps = maxStepsOverride ?? parseInt(process.env.MAX_AGENT_STEPS || '5', 10);

  const model = createModel(provider);

  // Build system + context messages
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

  // Pending tool-call events buffer (emit after execute returns)
  const pendingToolEvents: AgentEvent[] = [];

  const result = streamText({
    model,
    messages: fullMessages,
    tools: mcpTools,
    stopWhen: stepCountIs(maxSteps),
    temperature: 0.3,
    experimental_onToolCallStart: ({ toolCall }) => {
      pendingToolEvents.push({
        type: 'tool_call',
        name: toolCall.toolName,
        args: ('input' in toolCall ? toolCall.input : {}) as Record<string, unknown>,
        status: 'running',
      });
    },
    experimental_onToolCallFinish: (event) => {
      if (event.success) {
        pendingToolEvents.push({
          type: 'tool_call',
          name: event.toolCall.toolName,
          args: ('input' in event.toolCall ? event.toolCall.input : {}) as Record<string, unknown>,
          status: 'completed',
          result: typeof event.output === 'string'
            ? event.output
            : JSON.stringify(event.output).slice(0, 200),
        });
      } else {
        pendingToolEvents.push({
          type: 'tool_call',
          name: event.toolCall.toolName,
          args: {},
          status: 'error',
          result: event.error instanceof Error ? event.error.message : 'Tool call failed',
        });
      }
    },
  });

  // Stream text with code-block extraction
  let inCodeBlock = false;
  let codeBuffer = '';
  let proseBuffer = '';

  for await (const chunk of result.textStream) {
    // Drain any pending tool events before text chunks
    while (pendingToolEvents.length > 0) {
      yield pendingToolEvents.shift()!;
    }

    if (!inCodeBlock) {
      proseBuffer += chunk;
      // Detect code block start
      const startMatch = proseBuffer.match(/```(?:sysml|kerml)?\s*\n/);
      if (startMatch && startMatch.index !== undefined) {
        const before = proseBuffer.slice(0, startMatch.index);
        if (before.trim()) {
          yield { type: 'delta', content: before };
        }
        inCodeBlock = true;
        codeBuffer = proseBuffer.slice(startMatch.index + startMatch[0].length);
        proseBuffer = '';
      } else {
        // Emit complete lines
        const lastNewline = proseBuffer.lastIndexOf('\n');
        if (lastNewline >= 0) {
          const complete = proseBuffer.slice(0, lastNewline + 1);
          proseBuffer = proseBuffer.slice(lastNewline + 1);
          if (complete) {
            yield { type: 'delta', content: complete };
          }
        }
      }
    } else {
      codeBuffer += chunk;
      const endIdx = codeBuffer.indexOf('```');
      if (endIdx >= 0) {
        const codeContent = codeBuffer.slice(0, endIdx).trim();
        proseBuffer = codeBuffer.slice(endIdx + 3);
        codeBuffer = '';
        inCodeBlock = false;
        if (codeContent) {
          yield { type: 'code', content: codeContent, language: 'sysml', autoApply };
        }
      }
    }
  }

  // Drain remaining pending tool events
  while (pendingToolEvents.length > 0) {
    yield pendingToolEvents.shift()!;
  }

  // Flush remaining prose
  if (proseBuffer.trim()) {
    yield { type: 'delta', content: proseBuffer };
  }

  yield { type: 'done' };
}
