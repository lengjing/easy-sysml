/**
 * SysML Name Provider
 *
 * Handles SysML's naming conventions where elements use `declaredName`
 * and `declaredShortName` instead of the Langium default `name` property.
 */

import type { AstNode, NameProvider, CstNode } from 'langium';
import { findNameNode, getPrimaryName } from '../ast-names.js';

export class SysMLNameProvider implements NameProvider {
  getName(node: AstNode): string | undefined {
    return node ? getPrimaryName(node) : undefined;
  }

  getNameNode(node: AstNode): CstNode | undefined {
    if (!node?.$cstNode) return undefined;
    return findNameNode(node.$cstNode);
  }
}