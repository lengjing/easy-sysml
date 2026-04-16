import type { AstNode } from './nodes.js';

/** AST visitor interface */
export interface AstVisitor<T = void> {
  visit(node: AstNode): T;
  visitDefault?(node: AstNode): T;
}

/** Check if a value is an AstNode */
function isAstNode(value: unknown): value is AstNode {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as AstNode).$type === 'string' &&
    typeof (value as AstNode).$id === 'string'
  );
}

/** Walk the AST depth-first */
export function walkAst(node: AstNode, visitor: (node: AstNode) => void): void {
  visitor(node);

  for (const key of Object.keys(node)) {
    if (key.startsWith('$')) continue;

    const value = (node as unknown as Record<string, unknown>)[key];

    if (Array.isArray(value)) {
      for (const item of value) {
        if (isAstNode(item)) {
          walkAst(item, visitor);
        }
      }
    } else if (isAstNode(value)) {
      walkAst(value, visitor);
    }
  }
}

/** Collect all nodes of a specific type */
export function collectNodes<T extends AstNode>(root: AstNode, type: string): T[] {
  const result: T[] = [];
  walkAst(root, (node) => {
    if (node.$type === type) {
      result.push(node as T);
    }
  });
  return result;
}

/** Find ancestor of a specific type */
export function findAncestor<T extends AstNode>(node: AstNode, type: string): T | undefined {
  let current = node.$container;
  while (current) {
    if (current.$type === type) return current as T;
    current = current.$container;
  }
  return undefined;
}

/** Get the qualified name of a node by walking up the containment hierarchy */
export function getQualifiedName(node: AstNode): string | undefined {
  const parts: string[] = [];
  let current: AstNode | undefined = node;
  while (current) {
    const name = (current as unknown as Record<string, unknown>).name;
    if (typeof name === 'string') {
      parts.unshift(name);
    }
    current = current.$container;
  }
  return parts.length > 0 ? parts.join('::') : undefined;
}
