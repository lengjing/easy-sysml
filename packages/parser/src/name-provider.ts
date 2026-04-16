/**
 * SysML name provider — resolves element names from SysML v2 AST nodes.
 *
 * SysML uses `declaredName` as the primary name for elements.  Some generated
 * or imported elements use `name` instead.  This provider checks both,
 * following the SysML v2 spec naming conventions.
 */

import type { AstNode, CstNode } from 'langium';
import { DefaultNameProvider, GrammarUtils } from 'langium';

export class SysMLNameProvider extends DefaultNameProvider {

  override getName(node: AstNode): string | undefined {
    // SysML v2 standard: declaredName is the primary name
    const record = node as unknown as Record<string, unknown>;
    if (typeof record['declaredName'] === 'string' && record['declaredName']) {
      return record['declaredName'] as string;
    }
    // Fallback: standard 'name' property (Langium default)
    if (typeof record['name'] === 'string' && record['name']) {
      return record['name'] as string;
    }
    // Short name (SysML alias)
    if (typeof record['declaredShortName'] === 'string' && record['declaredShortName']) {
      return record['declaredShortName'] as string;
    }
    return undefined;
  }

  override getNameNode(node: AstNode): CstNode | undefined {
    return GrammarUtils.findNodeForProperty(node.$cstNode, 'declaredName')
        ?? GrammarUtils.findNodeForProperty(node.$cstNode, 'name')
        ?? GrammarUtils.findNodeForProperty(node.$cstNode, 'declaredShortName');
  }
}
