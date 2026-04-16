// ---------------------------------------------------------------------------
// Built-in validation rules — barrel export
// ---------------------------------------------------------------------------

export { duplicateNameRule, emptyNameRule } from './naming-rules.js';
export { unresolvedTypeRule, invalidSpecializationRule } from './typing-rules.js';
export { nestedPackageRule, orphanUsageRule, importTargetRule } from './structure-rules.js';
