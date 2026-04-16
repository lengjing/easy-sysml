/**
 * SysML diagnostic provider — wraps Langium's document validator
 * with improved error messages and cascade filtering.
 *
 * Design goals:
 * 1. Simplify verbose Chevrotain error messages
 * 2. Filter cascade errors (secondary errors caused by a primary parse error)
 * 3. Suppress diagnostics for standard-library documents
 */

import type {
  AstNode,
  LangiumDocument,
} from 'langium';
import { DefaultDocumentValidator } from 'langium';
import type { LangiumServices } from 'langium/lsp';
import type { Diagnostic } from 'vscode-languageserver';
import { DiagnosticSeverity } from 'vscode-languageserver';

/* ------------------------------------------------------------------ */
/*  Simplified Error Patterns                                          */
/* ------------------------------------------------------------------ */

const SIMPLIFICATIONS: Array<{ pattern: RegExp; replacement: string }> = [
  {
    pattern: /Expecting token of type '&&'/,
    replacement: "Use 'and' instead of '&&' for logical conjunction.",
  },
  {
    pattern: /Expecting token of type '\|\|'/,
    replacement: "Use 'or' instead of '||' for logical disjunction.",
  },
  {
    pattern: /alias\s+(\w+)\s+as\s+(\w+)/,
    replacement: "Use 'alias $2 for $1' (SysML v2 syntax).",
  },
  {
    pattern: /usecase/i,
    replacement: "Use 'use case' (two words) instead of 'usecase'.",
  },
];

/* ------------------------------------------------------------------ */
/*  Provider                                                           */
/* ------------------------------------------------------------------ */

export class SysMLDiagnosticProvider extends DefaultDocumentValidator {
  constructor(services: LangiumServices) {
    super(services);
  }

  override async validateDocument(
    document: LangiumDocument<AstNode>,
  ): Promise<Diagnostic[]> {
    // Skip validation for standard library documents
    const meta = document as unknown as Record<string, unknown>;
    if (meta['isStandard'] === true) {
      return [];
    }

    const diagnostics = await super.validateDocument(document);

    return this.processDiagnostics(diagnostics);
  }

  /* ---------------------------------------------------------------- */
  /*  Post-processing                                                  */
  /* ---------------------------------------------------------------- */

  private processDiagnostics(diagnostics: Diagnostic[]): Diagnostic[] {
    const simplified = diagnostics.map((d) => this.simplifyMessage(d));
    return this.filterCascadeErrors(simplified);
  }

  /**
   * Replace verbose Chevrotain messages with human-friendly alternatives.
   */
  private simplifyMessage(diagnostic: Diagnostic): Diagnostic {
    for (const { pattern, replacement } of SIMPLIFICATIONS) {
      if (pattern.test(diagnostic.message)) {
        return { ...diagnostic, message: replacement };
      }
    }

    // Truncate long "Expecting one of ..." messages
    const match = diagnostic.message.match(
      /^Expecting: one of these possible Token sequences:\s*\n(.+)/s,
    );
    if (match) {
      const lines = match[1].split('\n').filter((l) => l.trim());
      const shown = lines.slice(0, 3).map((l) => l.trim());
      const count = lines.length;
      const msg =
        count > 3
          ? `Expected one of: ${shown.join(', ')} (and ${count - 3} more)`
          : `Expected one of: ${shown.join(', ')}`;
      return { ...diagnostic, message: msg };
    }

    return diagnostic;
  }

  /**
   * Remove cascade (secondary) errors that are likely caused by a
   * preceding primary error on the same or adjacent line.
   *
   * Heuristic: if a Hint/Information diagnostic appears within 2 lines
   * of an Error diagnostic, it is likely a cascade error.
   */
  private filterCascadeErrors(diagnostics: Diagnostic[]): Diagnostic[] {
    if (diagnostics.length <= 1) return diagnostics;

    // Collect primary error lines
    const errorLines = new Set<number>();
    for (const d of diagnostics) {
      if (d.severity === DiagnosticSeverity.Error) {
        errorLines.add(d.range.start.line);
      }
    }

    return diagnostics.filter((d) => {
      // Always keep errors and warnings
      if (
        d.severity === DiagnosticSeverity.Error ||
        d.severity === DiagnosticSeverity.Warning
      ) {
        return true;
      }

      // Filter hints/info near error lines
      const line = d.range.start.line;
      for (const errorLine of errorLines) {
        if (Math.abs(line - errorLine) <= 2) {
          return false;
        }
      }
      return true;
    });
  }
}
