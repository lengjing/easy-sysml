export type { ValidationDiagnostic, ValidationContext, ValidationRule, ValidationPlugin } from './rule.js';
export { ValidationRegistry } from './registry.js';
export { ValidationEngine } from './engine.js';
export type { ValidationResult } from './engine.js';
export { definitionNamingRule, usageNamingRule, packageNameRule } from './rules/naming-rules.js';
export { emptyDefinitionRule, untypedUsageRule, duplicateNameRule } from './rules/structure-rules.js';
export { unresolvedTypeRule, specializationCompatibilityRule } from './rules/reference-rules.js';
export { sysmlCorePlugin } from './plugins/sysml-core-plugin.js';
