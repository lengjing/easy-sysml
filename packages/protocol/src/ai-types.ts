import type { UUID } from './sysml-types.js';

/** AI request intent */
export enum AIIntent {
  GENERATE_MODEL = 'generateModel',
  EXPLAIN_MODEL = 'explainModel',
  SUGGEST_COMPLETION = 'suggestCompletion',
  VALIDATE_MODEL = 'validateModel',
  REFACTOR_MODEL = 'refactorModel',
}

/** AI request */
export interface AIRequest {
  intent: AIIntent;
  prompt: string;
  context?: AIContext;
}

/** Context provided to AI */
export interface AIContext {
  currentDocument?: string;
  currentElementId?: UUID;
  modelSummary?: string;
  selectedText?: string;
}

/** AI response */
export interface AIResponse {
  success: boolean;
  content: string;
  generatedSysML?: string;
  suggestions?: string[];
  error?: string;
}

/** Message in AI chat */
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
}
