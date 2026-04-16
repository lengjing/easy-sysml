import { DiagnosticSeverity } from '@easy-sysml/protocol';
/** Rule: All type references should resolve */
export const unresolvedTypeRule = {
    id: 'sysml.reference.unresolved-type',
    description: 'Type references must resolve to a definition',
    severity: DiagnosticSeverity.ERROR,
    appliesTo: [], // checked via semantic analysis
    validate(node, context) {
        // This rule uses the semantic analysis results
        // Unresolved references are already reported by the reference resolver
        // This is a no-op placeholder that could be extended with additional checks
    },
};
/** Rule: Specialization targets must be compatible */
export const specializationCompatibilityRule = {
    id: 'sysml.reference.specialization-compatibility',
    description: 'Specialization targets must be of compatible metatype',
    severity: DiagnosticSeverity.ERROR,
    appliesTo: ['PartDefinition', 'AttributeDefinition', 'PortDefinition', 'ActionDefinition'],
    validate(node, context) {
        const specializations = node.specializations;
        if (!Array.isArray(specializations))
            return;
        for (const spec of specializations) {
            const generalName = spec.general;
            if (typeof generalName !== 'string')
                continue;
            const resolved = context.semantics.rootScope.resolveQualified(generalName)
                ?? context.semantics.rootScope.resolve(generalName);
            if (resolved && resolved.node.$type !== node.$type) {
                context.report({
                    code: this.id,
                    message: `Cannot specialize '${generalName}': incompatible type (expected ${node.$type}, found ${resolved.node.$type})`,
                    severity: this.severity,
                    node,
                    source: 'sysml-validation',
                });
            }
        }
    },
};
//# sourceMappingURL=reference-rules.js.map