/**
 * SysML validation — semantic rules that go beyond grammar-level syntax.
 *
 * Diagnostics are returned as a flat array of `ValidationDiagnostic` objects
 * so that consumers (language server, CLI, tests) can process them uniformly.
 */

import type { AstNode, LangiumDocument } from 'langium';

/* ------------------------------------------------------------------ */
/*  Public Types                                                       */
/* ------------------------------------------------------------------ */

export enum DiagnosticSeverity {
  Error = 1,
  Warning = 2,
  Information = 3,
  Hint = 4,
}

export interface ValidationDiagnostic {
  /** Human-readable message */
  message: string;
  /** Severity level */
  severity: DiagnosticSeverity;
  /** Machine-readable validation code */
  code: string;
  /** 0-based start line */
  line: number;
  /** 0-based start column */
  column: number;
  /** Character length of the problematic span */
  length: number;
  /** Optional AST node type where the issue was found */
  nodeType?: string;
}

export interface ValidationResult {
  diagnostics: ValidationDiagnostic[];
  /** `true` if there are no errors (warnings/hints are allowed) */
  valid: boolean;
}

/* ------------------------------------------------------------------ */
/*  Validator                                                          */
/* ------------------------------------------------------------------ */

/**
 * Registry-based validator: rules are registered by AST node type and
 * executed when a matching node is encountered during traversal.
 */
export class SysMLValidator {
  private rules = new Map<string, ValidationRule[]>();

  /** Register a validation rule for a specific AST node type. */
  registerRule(nodeType: string, rule: ValidationRule): void {
    const existing = this.rules.get(nodeType) ?? [];
    existing.push(rule);
    this.rules.set(nodeType, existing);
  }

  /** Validate a full document by traversing its AST. */
  validateDocument(document: LangiumDocument): ValidationResult {
    const diagnostics: ValidationDiagnostic[] = [];
    const root = document.parseResult.value;

    this.walkNode(root, diagnostics);

    return {
      diagnostics,
      valid: diagnostics.every((d) => d.severity !== DiagnosticSeverity.Error),
    };
  }

  private walkNode(node: AstNode, diagnostics: ValidationDiagnostic[]): void {
    const type = node.$type;
    const rules = this.rules.get(type);

    if (rules) {
      for (const rule of rules) {
        const issues = rule(node);
        if (issues) {
          diagnostics.push(...issues);
        }
      }
    }

    // Traverse children
    const record = node as unknown as Record<string, unknown>;
    for (const key of Object.keys(record)) {
      if (key.startsWith('$')) continue;
      const value = record[key];
      if (Array.isArray(value)) {
        for (const item of value) {
          if (isAstNode(item)) {
            this.walkNode(item, diagnostics);
          }
        }
      } else if (isAstNode(value)) {
        this.walkNode(value, diagnostics);
      }
    }
  }
}

/* ------------------------------------------------------------------ */
/*  Rule Type                                                          */
/* ------------------------------------------------------------------ */

/**
 * A validation rule receives an AST node and returns zero or more
 * diagnostics.  Returning `undefined` or an empty array means "no issues".
 */
export type ValidationRule = (
  node: AstNode,
) => ValidationDiagnostic[] | undefined;

/* ------------------------------------------------------------------ */
/*  Built-in Rules                                                     */
/* ------------------------------------------------------------------ */

/**
 * Create a validator pre-loaded with common SysML rules.
 */
export function createDefaultValidator(): SysMLValidator {
  const v = new SysMLValidator();

  // Rule: Package must have a name
  v.registerRule('Package', (node) => {
    const record = node as unknown as Record<string, unknown>;
    const name = record['declaredName'] ?? record['name'];
    if (!name) {
      return [
        makeDiagnostic(
          node,
          'Package should have a declared name.',
          'sysml-pkg-name',
          DiagnosticSeverity.Warning,
        ),
      ];
    }
    return undefined;
  });

  // Rule: PartDefinition should have a name
  v.registerRule('PartDefinition', (node) => {
    const record = node as unknown as Record<string, unknown>;
    const name = record['declaredName'] ?? record['name'];
    if (!name) {
      return [
        makeDiagnostic(
          node,
          'Part definition should have a declared name.',
          'sysml-partdef-name',
          DiagnosticSeverity.Warning,
        ),
      ];
    }
    return undefined;
  });

  return v;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function makeDiagnostic(
  node: AstNode,
  message: string,
  code: string,
  severity: DiagnosticSeverity,
): ValidationDiagnostic {
  const cst = node.$cstNode;
  return {
    message,
    severity,
    code,
    line: cst?.range.start.line ?? 0,
    column: cst?.range.start.character ?? 0,
    length: cst ? cst.end - cst.offset : 0,
    nodeType: node.$type,
  };
}

function isAstNode(value: unknown): value is AstNode {
  return (
    typeof value === 'object' &&
    value !== null &&
    '$type' in (value as Record<string, unknown>)
  );
}
