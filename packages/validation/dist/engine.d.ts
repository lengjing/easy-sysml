import type { PackageNode } from '@easy-sysml/ast';
import type { SemanticAnalysisResult } from '@easy-sysml/semantic';
import { ValidationRegistry } from './registry.js';
import type { ValidationDiagnostic } from './rule.js';
/** Result of validation */
export interface ValidationResult {
    diagnostics: ValidationDiagnostic[];
    rulesApplied: number;
    durationMs: number;
    hasErrors: boolean;
    hasWarnings: boolean;
}
/** Validation engine that runs rules against an AST */
export declare class ValidationEngine {
    private registry;
    constructor(registry?: ValidationRegistry);
    /** Get the registry for configuration */
    getRegistry(): ValidationRegistry;
    /** Validate an AST with semantic information */
    validate(ast: PackageNode, semantics: SemanticAnalysisResult): ValidationResult;
}
//# sourceMappingURL=engine.d.ts.map