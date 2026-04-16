import type { AstNode } from '@easy-sysml/ast';
import type { DiagnosticSeverity } from '@easy-sysml/protocol';
import type { SemanticAnalysisResult } from '@easy-sysml/semantic';
/** A diagnostic produced by validation */
export interface ValidationDiagnostic {
    code: string;
    message: string;
    severity: DiagnosticSeverity;
    node?: AstNode;
    line?: number;
    column?: number;
    source: string;
}
/** Context passed to validation rules */
export interface ValidationContext {
    ast: AstNode;
    semantics: SemanticAnalysisResult;
    report(diagnostic: ValidationDiagnostic): void;
}
/** A single validation rule */
export interface ValidationRule {
    /** Unique rule ID (e.g., 'sysml.naming.definition') */
    id: string;
    /** Human-readable description */
    description: string;
    /** Severity of violations */
    severity: DiagnosticSeverity;
    /** Node types this rule applies to (empty = all) */
    appliesTo: string[];
    /** Validate a single node */
    validate(node: AstNode, context: ValidationContext): void;
}
/** Plugin that provides validation rules */
export interface ValidationPlugin {
    /** Plugin name */
    name: string;
    /** Rules provided by this plugin */
    rules: ValidationRule[];
}
//# sourceMappingURL=rule.d.ts.map