// ---------------------------------------------------------------------------
// Custom message types for the easy-sysml system
// ---------------------------------------------------------------------------

import type { Diagnostic } from './lsp-types.js';
import type { SysMLElement, SysMLModel } from './sysml-types.js';

// ---------------------------------------------------------------------------
// Parse
// ---------------------------------------------------------------------------

/** Request to parse a SysML document. */
export interface ParseRequest {
  readonly uri: string;
  readonly content: string;
}

/** Response from a parse operation. */
export interface ParseResponse {
  readonly uri: string;
  readonly model: SysMLModel;
  readonly diagnostics: Diagnostic[];
  readonly duration?: number;
}

// ---------------------------------------------------------------------------
// Validate
// ---------------------------------------------------------------------------

/** Request to validate a SysML model. */
export interface ValidateRequest {
  readonly uri: string;
  readonly model: SysMLModel;
}

/** Response from a validation operation. */
export interface ValidateResponse {
  readonly uri: string;
  readonly diagnostics: Diagnostic[];
  readonly valid: boolean;
}

// ---------------------------------------------------------------------------
// Model updates
// ---------------------------------------------------------------------------

/** Notification emitted when a model has been updated. */
export interface ModelUpdateNotification {
  readonly uri: string;
  readonly model: SysMLModel;
  readonly changedElements?: SysMLElement[];
}

// ---------------------------------------------------------------------------
// AI generation
// ---------------------------------------------------------------------------

/** Request for AI-assisted SysML generation. */
export interface AIGenerateRequest {
  readonly prompt: string;
  readonly context?: string;
  readonly uri?: string;
  readonly existingElements?: SysMLElement[];
}

/** Response from an AI generation request. */
export interface AIGenerateResponse {
  readonly generatedText: string;
  readonly model?: SysMLModel;
  readonly diagnostics?: Diagnostic[];
  readonly confidence?: number;
}
