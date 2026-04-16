import type { AstNode } from './nodes.js';
/** AST visitor interface */
export interface AstVisitor<T = void> {
    visit(node: AstNode): T;
    visitDefault?(node: AstNode): T;
}
/** Walk the AST depth-first */
export declare function walkAst(node: AstNode, visitor: (node: AstNode) => void): void;
/** Collect all nodes of a specific type */
export declare function collectNodes<T extends AstNode>(root: AstNode, type: string): T[];
/** Find ancestor of a specific type */
export declare function findAncestor<T extends AstNode>(node: AstNode, type: string): T | undefined;
/** Get the qualified name of a node by walking up the containment hierarchy */
export declare function getQualifiedName(node: AstNode): string | undefined;
//# sourceMappingURL=visitor.d.ts.map