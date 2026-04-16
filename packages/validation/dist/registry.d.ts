import type { ValidationRule, ValidationPlugin } from './rule.js';
/** Registry that manages validation rules and plugins */
export declare class ValidationRegistry {
    private rules;
    private plugins;
    private disabledRules;
    /** Register a single rule */
    registerRule(rule: ValidationRule): void;
    /** Register a plugin (all its rules) */
    registerPlugin(plugin: ValidationPlugin): void;
    /** Disable a rule by ID */
    disableRule(ruleId: string): void;
    /** Enable a rule by ID */
    enableRule(ruleId: string): void;
    /** Get all active rules */
    getActiveRules(): ValidationRule[];
    /** Get rules that apply to a specific node type */
    getRulesForType(nodeType: string): ValidationRule[];
    /** Get a rule by ID */
    getRule(id: string): ValidationRule | undefined;
    /** Get all registered plugins */
    getPlugins(): ValidationPlugin[];
}
//# sourceMappingURL=registry.d.ts.map