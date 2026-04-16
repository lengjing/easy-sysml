// ---------------------------------------------------------------------------
// AI interaction types
// ---------------------------------------------------------------------------

/** The role of a participant in a chat conversation. */
export enum ChatRole {
  User = 'user',
  Assistant = 'assistant',
  System = 'system',
}

/** A single message in a chat conversation. */
export interface ChatMessage {
  readonly role: ChatRole;
  readonly content: string;
}

/** A chunk of a streamed model response. */
export interface StreamChunk {
  readonly type: string;
  readonly content: string;
  readonly done: boolean;
}

/** A tool invocation requested by the AI model. */
export interface ToolCall {
  readonly id: string;
  readonly name: string;
  readonly arguments: Record<string, unknown>;
}

/** The result produced by an AI model generation step. */
export interface ModelGenerationResult {
  readonly text: string;
  readonly toolCalls?: ToolCall[];
  readonly finishReason?: string;
  readonly usage?: TokenUsage;
}

/** Token usage statistics for a generation request. */
export interface TokenUsage {
  readonly promptTokens: number;
  readonly completionTokens: number;
  readonly totalTokens: number;
}
