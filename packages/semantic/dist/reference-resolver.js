/** Reference resolver - links cross-references in the AST */
export class ReferenceResolver {
    symbolTable;
    rootScope;
    resolved = [];
    unresolved = [];
    constructor(symbolTable, rootScope) {
        this.symbolTable = symbolTable;
        this.rootScope = rootScope;
    }
    /** Resolve all references in the AST */
    resolveAll(root) {
        this.resolved = [];
        this.unresolved = [];
        this.resolveNode(root, this.rootScope);
    }
    /** Get resolved references */
    getResolved() {
        return this.resolved;
    }
    /** Get unresolved references (for diagnostics) */
    getUnresolved() {
        return this.unresolved;
    }
    /** Find all references to a symbol */
    findReferences(symbol) {
        return this.resolved.filter((ref) => ref.target === symbol);
    }
    resolveNode(node, scope) {
        const nodeType = node.$type;
        // Determine the scope for children of this node
        const name = node.name;
        const childScope = name && scope.getChild(name) ? scope.getChild(name) : scope;
        // Resolve type references (typings)
        this.resolveTyping(node, childScope);
        // Resolve specialization references
        this.resolveSpecialization(node, childScope);
        // Resolve import references
        this.resolveImport(node, childScope);
        // Process children
        for (const key of Object.keys(node)) {
            if (key.startsWith('$'))
                continue;
            const value = node[key];
            if (Array.isArray(value)) {
                for (const item of value) {
                    if (isAstNode(item)) {
                        // Membership nodes: resolve the member element in the parent's child scope
                        if (item.$type === 'Membership') {
                            const memberElement = item.memberElement;
                            if (memberElement) {
                                this.resolveNode(memberElement, childScope);
                            }
                        }
                        else {
                            this.resolveNode(item, childScope);
                        }
                    }
                }
            }
            else if (isAstNode(value)) {
                this.resolveNode(value, childScope);
            }
        }
    }
    resolveTyping(node, scope) {
        const typings = node.typings;
        if (!typings)
            return;
        for (const typing of typings) {
            if (!typing.type)
                continue;
            const target = scope.resolve(typing.type) ?? scope.resolveQualified(typing.type);
            const range = node.$range;
            const line = range?.start?.line ?? 0;
            const column = range?.start?.character ?? 0;
            if (target) {
                this.resolved.push({
                    source: node,
                    target,
                    kind: 'typing',
                    referenceName: typing.type,
                });
                // Link the usage symbol to its definition
                const sourceSymbol = this.symbolTable.getForNode(node);
                if (sourceSymbol) {
                    sourceSymbol.definition = target;
                    sourceSymbol.type = target;
                }
            }
            else {
                this.unresolved.push({
                    source: node,
                    referenceName: typing.type,
                    kind: 'typing',
                    message: `Cannot resolve type '${typing.type}'`,
                    line,
                    column,
                });
            }
        }
    }
    resolveSpecialization(node, scope) {
        const specializations = node.specializations;
        if (!specializations)
            return;
        for (const spec of specializations) {
            if (!spec.general)
                continue;
            const target = scope.resolve(spec.general) ?? scope.resolveQualified(spec.general);
            const range = node.$range;
            const line = range?.start?.line ?? 0;
            const column = range?.start?.character ?? 0;
            if (target) {
                this.resolved.push({
                    source: node,
                    target,
                    kind: 'specialization',
                    referenceName: spec.general,
                });
            }
            else {
                this.unresolved.push({
                    source: node,
                    referenceName: spec.general,
                    kind: 'specialization',
                    message: `Cannot resolve specialization target '${spec.general}'`,
                    line,
                    column,
                });
            }
        }
    }
    resolveImport(node, scope) {
        if (node.$type !== 'Import')
            return;
        const importedNamespace = node.importedNamespace;
        if (!importedNamespace)
            return;
        const target = this.rootScope.resolve(importedNamespace) ?? this.rootScope.resolveQualified(importedNamespace);
        const range = node.$range;
        const line = range?.start?.line ?? 0;
        const column = range?.start?.character ?? 0;
        if (target) {
            this.resolved.push({
                source: node,
                target,
                kind: 'import',
                referenceName: importedNamespace,
            });
        }
        else {
            this.unresolved.push({
                source: node,
                referenceName: importedNamespace,
                kind: 'import',
                message: `Cannot resolve imported namespace '${importedNamespace}'`,
                line,
                column,
            });
        }
    }
}
function isAstNode(value) {
    return (typeof value === 'object' &&
        value !== null &&
        typeof value.$type === 'string' &&
        typeof value.$id === 'string');
}
//# sourceMappingURL=reference-resolver.js.map