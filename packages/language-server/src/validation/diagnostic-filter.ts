/**
 * Diagnostic Filter — Cascade Error Detection
 *
 * Filters secondary/cascade errors to improve user experience.
 * When a primary error causes parser recovery, secondary errors
 * are identified and filtered out.
 */

import type { Diagnostic } from 'vscode-languageserver';

export type DiagnosticConfidence = 'high' | 'medium' | 'low';

export function classifyConfidence(diagnostic: Diagnostic): DiagnosticConfidence {
  const message = diagnostic.message;

  if (
    message.includes('Could not resolve') ||
    message.includes('Cannot find') ||
    message.includes('Type mismatch') ||
    message.includes('already defined') ||
    message.includes('is not assignable') ||
    message.includes('undefined') ||
    message.includes("Use 'and' instead of") ||
    message.includes("Use 'or' instead of") ||
    message.includes('Alias syntax is') ||
    message.includes("'actor' declarations are only valid")
  ) {
    return 'high';
  }

  if (
    message.includes('Expecting end of file') ||
    (message.includes('Expecting token of type') && message.includes('but found')) ||
    message.startsWith('Unexpected token') ||
    (message.includes('unexpected character') && message.includes('skipped'))
  ) {
    return 'low';
  }

  return 'medium';
}

export function filterDiagnostics(
  diagnostics: Diagnostic[],
  options: { enableFiltering?: boolean } = {},
): Diagnostic[] {
  const { enableFiltering = true } = options;
  if (!enableFiltering || diagnostics.length <= 1) return diagnostics;

  const annotated = diagnostics.map((d) => ({
    diagnostic: d,
    confidence: classifyConfidence(d),
  }));

  const hasHigh = annotated.some((a) => a.confidence === 'high');
  if (!hasHigh) return diagnostics;

  return annotated
    .filter((a) => {
      if (a.confidence !== 'low') return true;
      // Check if there is a high-confidence error within 5 lines before
      const line = a.diagnostic.range.start.line;
      return !annotated.some(
        (h) =>
          h.confidence === 'high' &&
          h.diagnostic.range.start.line <= line &&
          h.diagnostic.range.start.line >= line - 5,
      );
    })
    .map((a) => a.diagnostic);
}
