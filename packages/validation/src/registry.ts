import type { ValidationRule, ValidationPlugin } from './rule.js';

/** Registry that manages validation rules and plugins */
export class ValidationRegistry {
  private rules = new Map<string, ValidationRule>();
  private plugins = new Map<string, ValidationPlugin>();
  private disabledRules = new Set<string>();

  /** Register a single rule */
  registerRule(rule: ValidationRule): void {
    this.rules.set(rule.id, rule);
  }

  /** Register a plugin (all its rules) */
  registerPlugin(plugin: ValidationPlugin): void {
    this.plugins.set(plugin.name, plugin);
    for (const rule of plugin.rules) {
      this.registerRule(rule);
    }
  }

  /** Disable a rule by ID */
  disableRule(ruleId: string): void {
    this.disabledRules.add(ruleId);
  }

  /** Enable a rule by ID */
  enableRule(ruleId: string): void {
    this.disabledRules.delete(ruleId);
  }

  /** Get all active rules */
  getActiveRules(): ValidationRule[] {
    return Array.from(this.rules.values())
      .filter(r => !this.disabledRules.has(r.id));
  }

  /** Get rules that apply to a specific node type */
  getRulesForType(nodeType: string): ValidationRule[] {
    return this.getActiveRules()
      .filter(r => r.appliesTo.length === 0 || r.appliesTo.includes(nodeType));
  }

  /** Get a rule by ID */
  getRule(id: string): ValidationRule | undefined {
    return this.rules.get(id);
  }

  /** Get all registered plugins */
  getPlugins(): ValidationPlugin[] {
    return Array.from(this.plugins.values());
  }
}
