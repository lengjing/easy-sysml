/** Registry that manages validation rules and plugins */
export class ValidationRegistry {
    rules = new Map();
    plugins = new Map();
    disabledRules = new Set();
    /** Register a single rule */
    registerRule(rule) {
        this.rules.set(rule.id, rule);
    }
    /** Register a plugin (all its rules) */
    registerPlugin(plugin) {
        this.plugins.set(plugin.name, plugin);
        for (const rule of plugin.rules) {
            this.registerRule(rule);
        }
    }
    /** Disable a rule by ID */
    disableRule(ruleId) {
        this.disabledRules.add(ruleId);
    }
    /** Enable a rule by ID */
    enableRule(ruleId) {
        this.disabledRules.delete(ruleId);
    }
    /** Get all active rules */
    getActiveRules() {
        return Array.from(this.rules.values())
            .filter(r => !this.disabledRules.has(r.id));
    }
    /** Get rules that apply to a specific node type */
    getRulesForType(nodeType) {
        return this.getActiveRules()
            .filter(r => r.appliesTo.length === 0 || r.appliesTo.includes(nodeType));
    }
    /** Get a rule by ID */
    getRule(id) {
        return this.rules.get(id);
    }
    /** Get all registered plugins */
    getPlugins() {
        return Array.from(this.plugins.values());
    }
}
//# sourceMappingURL=registry.js.map