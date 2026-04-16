/** Check if a value is an AstNode */
function isAstNode(value) {
    return (typeof value === 'object' &&
        value !== null &&
        typeof value.$type === 'string' &&
        typeof value.$id === 'string');
}
/** Walk the AST depth-first */
export function walkAst(node, visitor) {
    visitor(node);
    for (const key of Object.keys(node)) {
        if (key.startsWith('$'))
            continue;
        const value = node[key];
        if (Array.isArray(value)) {
            for (const item of value) {
                if (isAstNode(item)) {
                    walkAst(item, visitor);
                }
            }
        }
        else if (isAstNode(value)) {
            walkAst(value, visitor);
        }
    }
}
/** Collect all nodes of a specific type */
export function collectNodes(root, type) {
    const result = [];
    walkAst(root, (node) => {
        if (node.$type === type) {
            result.push(node);
        }
    });
    return result;
}
/** Find ancestor of a specific type */
export function findAncestor(node, type) {
    let current = node.$container;
    while (current) {
        if (current.$type === type)
            return current;
        current = current.$container;
    }
    return undefined;
}
/** Get the qualified name of a node by walking up the containment hierarchy */
export function getQualifiedName(node) {
    const parts = [];
    let current = node;
    while (current) {
        const name = current.name;
        if (typeof name === 'string') {
            parts.unshift(name);
        }
        current = current.$container;
    }
    return parts.length > 0 ? parts.join('::') : undefined;
}
//# sourceMappingURL=visitor.js.map