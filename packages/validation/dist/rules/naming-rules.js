import { DiagnosticSeverity } from '@easy-sysml/protocol';
/** Rule: Definition names should start with uppercase */
export const definitionNamingRule = {
    id: 'sysml.naming.definition-uppercase',
    description: 'Definition names should start with an uppercase letter',
    severity: DiagnosticSeverity.WARNING,
    appliesTo: ['PartDefinition', 'AttributeDefinition', 'PortDefinition', 'ActionDefinition', 'StateDefinition', 'RequirementDefinition', 'ConstraintDefinition'],
    validate(node, context) {
        const name = node.name;
        if (typeof name === 'string' && name.length > 0 && name[0] !== name[0].toUpperCase()) {
            context.report({
                code: this.id,
                message: `Definition name '${name}' should start with an uppercase letter`,
                severity: this.severity,
                node,
                source: 'sysml-validation',
            });
        }
    },
};
/** Rule: Usage names should start with lowercase */
export const usageNamingRule = {
    id: 'sysml.naming.usage-lowercase',
    description: 'Usage names should start with a lowercase letter',
    severity: DiagnosticSeverity.WARNING,
    appliesTo: ['PartUsage', 'AttributeUsage', 'PortUsage', 'ActionUsage', 'StateUsage'],
    validate(node, context) {
        const name = node.name;
        if (typeof name === 'string' && name.length > 0 && name[0] !== name[0].toLowerCase()) {
            context.report({
                code: this.id,
                message: `Usage name '${name}' should start with a lowercase letter`,
                severity: this.severity,
                node,
                source: 'sysml-validation',
            });
        }
    },
};
/** Rule: Package names should not be empty */
export const packageNameRule = {
    id: 'sysml.naming.package-nonempty',
    description: 'Package names must not be empty',
    severity: DiagnosticSeverity.ERROR,
    appliesTo: ['Package'],
    validate(node, context) {
        const name = node.name;
        if (name === undefined || name === '') {
            context.report({
                code: this.id,
                message: 'Package must have a name',
                severity: this.severity,
                node,
                source: 'sysml-validation',
            });
        }
    },
};
//# sourceMappingURL=naming-rules.js.map