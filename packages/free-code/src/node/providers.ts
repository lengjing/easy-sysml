/**
 * Multi-provider API client factory for free-code Node.js library.
 *
 * Mirrors free-code's provider selection logic from
 * `src/utils/model/providers.ts` and `src/services/api/client.ts`.
 *
 * Provider is chosen by environment variables (same vars as the CLI):
 *
 * | Provider       | Env var                          | Default model              |
 * |----------------|----------------------------------|----------------------------|
 * | Anthropic API  | (default, no env var needed)     | claude-sonnet-4-6          |
 * | AWS Bedrock    | CLAUDE_CODE_USE_BEDROCK=1        | aws-mapped model name      |
 * | Google Vertex  | CLAUDE_CODE_USE_VERTEX=1         | vertex-mapped model name   |
 * | Foundry        | CLAUDE_CODE_USE_FOUNDRY=1        | as configured              |
 * | OpenAI-compat  | CLAUDE_CODE_USE_OPENAI=1         | gpt-5.3-codex              |
 */

// ---------------------------------------------------------------------------
// Provider type
// ---------------------------------------------------------------------------

export type APIProvider = 'firstParty' | 'bedrock' | 'vertex' | 'foundry' | 'openai'

function isEnvTruthy(val: string | undefined): boolean {
  return val === '1' || val === 'true' || val === 'yes'
}

/**
 * Returns the active API provider based on environment variables.
 * Mirrors `getAPIProvider()` from `src/utils/model/providers.ts`.
 */
export function getAPIProvider(): APIProvider {
  if (isEnvTruthy(process.env.CLAUDE_CODE_USE_BEDROCK)) return 'bedrock'
  if (isEnvTruthy(process.env.CLAUDE_CODE_USE_VERTEX)) return 'vertex'
  if (isEnvTruthy(process.env.CLAUDE_CODE_USE_FOUNDRY)) return 'foundry'
  if (isEnvTruthy(process.env.CLAUDE_CODE_USE_OPENAI)) return 'openai'
  return 'firstParty'
}

// ---------------------------------------------------------------------------
// Default model selection
// ---------------------------------------------------------------------------

/** Returns the default model for the given provider */
export function getDefaultModel(provider: APIProvider): string {
  switch (provider) {
    case 'bedrock':
      // Bedrock uses region-prefixed model IDs
      return `us.anthropic.claude-sonnet-4-6-v1`
    case 'vertex':
      // Vertex uses model@latest format
      return `claude-sonnet-4-6@latest`
    case 'openai':
      return `gpt-5.3-codex`
    case 'foundry':
      return process.env.ANTHROPIC_MODEL ?? `claude-sonnet-4-6`
    default:
      // firstParty — respect explicit overrides from env (same logic as free-code)
      return (
        process.env.ANTHROPIC_MODEL ??
        process.env.ANTHROPIC_DEFAULT_SONNET_MODEL ??
        `claude-sonnet-4-6`
      )
  }
}

// ---------------------------------------------------------------------------
// Minimal common interface shared by all Anthropic SDK variants
// ---------------------------------------------------------------------------

/**
 * Subset of the Anthropic SDK interface that all provider clients expose.
 * Allows the agent to be provider-agnostic.
 */
export interface AnthropicClientLike {
  messages: {
    stream(
      params: Record<string, unknown>,
      options?: Record<string, unknown>,
    ): AsyncIterable<unknown> & {
      finalMessage(): Promise<unknown>
      on(event: string, listener: (event: unknown) => void): unknown
    }
    create(
      params: Record<string, unknown>,
      options?: Record<string, unknown>,
    ): Promise<unknown>
  }
}

// ---------------------------------------------------------------------------
// Client factory
// ---------------------------------------------------------------------------

export interface CreateClientOptions {
  /** API key (Anthropic firstParty / Foundry). Falls back to env vars. */
  apiKey?: string
  /** Max retries on transient errors. Default: 2 */
  maxRetries?: number
}

/**
 * Creates the appropriate Anthropic SDK client for the current provider.
 *
 * Uses dynamic imports so that only the relevant SDK package is loaded. The
 * other SDK packages (bedrock-sdk, vertex-sdk, foundry-sdk) are optional peer
 * dependencies — a missing package throws a descriptive error only when that
 * provider is actually selected.
 */
export async function createAPIClient(
  opts: CreateClientOptions = {},
): Promise<AnthropicClientLike> {
  const provider = getAPIProvider()
  const maxRetries = opts.maxRetries ?? 2

  switch (provider) {
    case 'bedrock': {
      // @anthropic-ai/bedrock-sdk
      let AnthropicBedrock: new (opts: Record<string, unknown>) => AnthropicClientLike
      try {
        const mod = await import('@anthropic-ai/bedrock-sdk')
        AnthropicBedrock = mod.default ?? (mod as unknown as { AnthropicBedrock: typeof AnthropicBedrock }).AnthropicBedrock
      } catch {
        throw new Error(
          'AWS Bedrock provider requires @anthropic-ai/bedrock-sdk. ' +
            'Install it with: npm install @anthropic-ai/bedrock-sdk',
        )
      }
      return new AnthropicBedrock({
        awsRegion:
          process.env.AWS_REGION ??
          process.env.AWS_DEFAULT_REGION ??
          'us-east-1',
        ...(process.env.ANTHROPIC_BEDROCK_BASE_URL
          ? { baseURL: process.env.ANTHROPIC_BEDROCK_BASE_URL }
          : {}),
        maxRetries,
      })
    }

    case 'vertex': {
      // @anthropic-ai/vertex-sdk
      let AnthropicVertex: new (opts: Record<string, unknown>) => AnthropicClientLike
      try {
        const mod = await import('@anthropic-ai/vertex-sdk')
        AnthropicVertex = mod.default ?? (mod as unknown as { AnthropicVertex: typeof AnthropicVertex }).AnthropicVertex
      } catch {
        throw new Error(
          'Google Vertex AI provider requires @anthropic-ai/vertex-sdk. ' +
            'Install it with: npm install @anthropic-ai/vertex-sdk',
        )
      }
      return new AnthropicVertex({
        projectId: process.env.ANTHROPIC_VERTEX_PROJECT_ID ?? '',
        region: process.env.CLOUD_ML_REGION ?? 'us-east5',
        maxRetries,
      })
    }

    case 'foundry': {
      // @anthropic-ai/foundry-sdk
      let AnthropicFoundry: new (opts: Record<string, unknown>) => AnthropicClientLike
      try {
        const mod = await import('@anthropic-ai/foundry-sdk')
        AnthropicFoundry = mod.default ?? (mod as unknown as { AnthropicFoundry: typeof AnthropicFoundry }).AnthropicFoundry
      } catch {
        throw new Error(
          'Anthropic Foundry provider requires @anthropic-ai/foundry-sdk. ' +
            'Install it with: npm install @anthropic-ai/foundry-sdk',
        )
      }
      return new AnthropicFoundry({
        apiKey:
          opts.apiKey ??
          process.env.ANTHROPIC_FOUNDRY_API_KEY ??
          process.env.ANTHROPIC_API_KEY ??
          '',
        ...(process.env.ANTHROPIC_FOUNDRY_BASE_URL
          ? { baseURL: process.env.ANTHROPIC_FOUNDRY_BASE_URL }
          : {}),
        maxRetries,
      })
    }

    case 'openai': {
      // OpenAI-compatible: use @anthropic-ai/sdk with a custom baseURL
      // (same pattern as free-code's codex-fetch-adapter.ts)
      const { default: Anthropic } = await import('@anthropic-ai/sdk')
      return new Anthropic({
        apiKey: opts.apiKey ?? process.env.ANTHROPIC_API_KEY ?? 'openai',
        baseURL:
          process.env.ANTHROPIC_BASE_URL ??
          'https://api.openai.com/v1',
        defaultHeaders: {
          'anthropic-version': '2023-06-01',
        },
        maxRetries,
      }) as unknown as AnthropicClientLike
    }

    default: {
      // firstParty — direct Anthropic API
      const { default: Anthropic } = await import('@anthropic-ai/sdk')
      return new Anthropic({
        apiKey:
          opts.apiKey ??
          process.env.ANTHROPIC_API_KEY ??
          process.env.ANTHROPIC_AUTH_TOKEN ??
          '',
        ...(process.env.ANTHROPIC_BASE_URL
          ? { baseURL: process.env.ANTHROPIC_BASE_URL }
          : {}),
        maxRetries,
      }) as unknown as AnthropicClientLike
    }
  }
}
