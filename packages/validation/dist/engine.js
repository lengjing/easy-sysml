import { walkAst } from '@easy-sysml/ast';
import { ValidationRegistry } from './registry.js';
/** Validation engine that runs rules against an AST */
export class ValidationEngine {
    registry;
    constructor(registry) {
        this.registry = registry ?? new ValidationRegistry();
    }
    /** Get the registry for configuration */
    getRegistry() {
        return this.registry;
    }
    /** Validate an AST with semantic information */
    validate(ast, semantics) {
        const start = Date.now();
        const diagnostics = [];
        let rulesApplied = 0;
        const context = {
            ast,
            semantics,
            report: (diagnostic) => diagnostics.push(diagnostic),
        };
        // Walk the AST and apply matching rules to each node
        walkAst(ast, (node) => {
            const rules = this.registry.getRulesForType(node.$type);
            for (const rule of rules) {
                rule.validate(node, context);
                rulesApplied++;
            }
        });
        const durationMs = Date.now() - start;
        return {
            diagnostics,
            rulesApplied,
            durationMs,
            hasErrors: diagnostics.some(d => d.severity === 1),
            hasWarnings: diagnostics.some(d => d.severity === 2),
        };
    }
}
//# sourceMappingURL=engine.js.map