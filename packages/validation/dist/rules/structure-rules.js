import { DiagnosticSeverity } from '@easy-sysml/protocol';
/** Rule: Definitions should have at least one feature */
export const emptyDefinitionRule = {
    id: 'sysml.structure.empty-definition',
    description: 'Definitions should have at least one member',
    severity: DiagnosticSeverity.INFORMATION,
    appliesTo: ['PartDefinition', 'PortDefinition', 'ActionDefinition', 'StateDefinition'],
    validate(node, context) {
        const members = node.members;
        if (Array.isArray(members) && members.length === 0) {
            context.report({
                code: this.id,
                message: `Definition '${node.name || '<unnamed>'}' has no members`,
                severity: this.severity,
                node,
                source: 'sysml-validation',
            });
        }
    },
};
/** Rule: Usages should have a type */
export const untypedUsageRule = {
    id: 'sysml.structure.untyped-usage',
    description: 'Usage elements should have a type',
    severity: DiagnosticSeverity.WARNING,
    appliesTo: ['PartUsage', 'AttributeUsage', 'PortUsage'],
    validate(node, context) {
        const typings = node.typings;
        if (Array.isArray(typings) && typings.length === 0) {
            const name = node.name;
            context.report({
                code: this.id,
                message: `Usage '${name || '<unnamed>'}' has no type specified`,
                severity: this.severity,
                node,
                source: 'sysml-validation',
            });
        }
    },
};
/** Rule: No duplicate names in the same scope */
export const duplicateNameRule = {
    id: 'sysml.structure.duplicate-name',
    description: 'Elements in the same scope should have unique names',
    severity: DiagnosticSeverity.ERROR,
    appliesTo: [], // applies to all
    validate(node, context) {
        const members = node.members;
        if (!Array.isArray(members))
            return;
        const names = new Map();
        for (const member of members) {
            const memberElement = member.memberElement ?? member;
            const name = memberElement.name;
            if (typeof name === 'string' && name.length > 0) {
                if (names.has(name)) {
                    context.report({
                        code: this.id,
                        message: `Duplicate name '${name}' in scope`,
                        severity: this.severity,
                        node: memberElement,
                        source: 'sysml-validation',
                    });
                }
                else {
                    names.set(name, memberElement);
                }
            }
        }
    },
};
//# sourceMappingURL=structure-rules.js.map