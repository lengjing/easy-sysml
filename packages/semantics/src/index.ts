// ---------------------------------------------------------------------------
// @easy-sysml/semantics — barrel export
// ---------------------------------------------------------------------------

export { SymbolTable } from './symbol.js';
export type { Symbol } from './symbol.js';

export { ScopeProvider } from './scope.js';
export type { Scope } from './scope.js';

export { TypeRegistry, TypeChecker } from './type-system.js';
export type { SysMLType, TypeCheckResult } from './type-system.js';

export { ReferenceLinker } from './reference-linker.js';
export type { Reference, ResolvedReference, ReferenceKind } from './reference-linker.js';

export { ValidationEngine } from './validation.js';
export type { ValidationRule, ValidationContext } from './validation.js';

export { SemanticModel } from './semantic-model.js';
export type { SemanticModelResult } from './semantic-model.js';

export {
  duplicateNameRule,
  emptyNameRule,
  unresolvedTypeRule,
  invalidSpecializationRule,
  nestedPackageRule,
  orphanUsageRule,
  importTargetRule,
} from './rules/index.js';
