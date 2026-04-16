import { definitionNamingRule, usageNamingRule, packageNameRule } from '../rules/naming-rules.js';
import { emptyDefinitionRule, untypedUsageRule, duplicateNameRule } from '../rules/structure-rules.js';
import { unresolvedTypeRule, specializationCompatibilityRule } from '../rules/reference-rules.js';
/** Core SysML v2 validation plugin with standard rules */
export const sysmlCorePlugin = {
    name: 'sysml-core',
    rules: [
        definitionNamingRule,
        usageNamingRule,
        packageNameRule,
        emptyDefinitionRule,
        untypedUsageRule,
        duplicateNameRule,
        unresolvedTypeRule,
        specializationCompatibilityRule,
    ],
};
//# sourceMappingURL=sysml-core-plugin.js.map