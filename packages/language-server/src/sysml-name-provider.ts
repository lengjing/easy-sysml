/**
 * SysML Name Provider
 *
 * Handles SysML's naming conventions where elements use `declaredName`
 * and `declaredShortName` instead of the Langium default `name` property.
 */

import type { AstNode, NameProvider, CstNode } from 'langium';
import { GrammarUtils } from 'langium';

/* eslint-disable @typescript-eslint/no-explicit-any */

export class SysMLNameProvider implements NameProvider {
  getName(node: AstNode): string | undefined {
    if (!node) return undefined;
    const n = node as any;

    if (typeof n.declaredName === 'string') return n.declaredName;
    if (typeof n.name === 'string') return n.name;
    if (typeof n.memberName === 'string') return n.memberName;

    return undefined;
  }

  getNameNode(node: AstNode): CstNode | undefined {
    if (!node?.$cstNode) return undefined;

    for (const prop of ['declaredName', 'name', 'memberName']) {
      const found = GrammarUtils.findNodeForProperty(node.$cstNode, prop);
      if (found) return found;
    }

    return undefined;
  }
}
