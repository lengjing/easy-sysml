/**
 * SysML scope computation — indexes named elements for cross-reference resolution.
 *
 * SysML v2 has a relationship-based AST where children are reached through
 * `ownedRelationship` arrays rather than direct containment.  This provider
 * traverses that structure to discover named elements and register them in
 * the workspace index.
 */

import type { AstNode, AstNodeDescription, LangiumDocument } from 'langium';
import { AstUtils, DefaultScopeComputation } from 'langium';

export class SysMLScopeComputation extends DefaultScopeComputation {

  /**
   * Export descriptions for all named elements in the document.
   *
   * We walk the AST through `ownedRelationship` and `ownedMember` arrays
   * to find elements with `declaredName` or `name`, then export them with
   * their qualified name.
   */
  override async collectExportedSymbols(
    document: LangiumDocument,
  ): Promise<AstNodeDescription[]> {
    const descriptions: AstNodeDescription[] = [];
    const root = document.parseResult.value;

    this.collectExports(root, descriptions, document);

    return descriptions;
  }

  private collectExports(
    node: AstNode,
    descriptions: AstNodeDescription[],
    document: LangiumDocument,
  ): void {
    const name = this.getNodeName(node);
    if (name) {
      descriptions.push(
        this.descriptions.createDescription(node, name, document),
      );

      // Also export by short name if it exists
      const record = node as unknown as Record<string, unknown>;
      const shortName = record['declaredShortName'] as string | undefined;
      if (shortName && shortName !== name) {
        descriptions.push(
          this.descriptions.createDescription(node, shortName, document),
        );
      }
    }

    // Traverse through ownedRelationship arrays (SysML's containment model)
    this.traverseChildren(node, descriptions, document);
  }

  private traverseChildren(
    node: AstNode,
    descriptions: AstNodeDescription[],
    document: LangiumDocument,
  ): void {
    const record = node as unknown as Record<string, unknown>;

    // SysML uses ownedRelationship to contain child elements
    const rels = record['ownedRelationship'];
    if (Array.isArray(rels)) {
      for (const rel of rels) {
        if (this.isAstNode(rel)) {
          // Check ownedRelatedElement inside relationship
          const relRecord = rel as unknown as Record<string, unknown>;
          const owned = relRecord['ownedRelatedElement'];
          if (Array.isArray(owned)) {
            for (const child of owned) {
              if (this.isAstNode(child)) {
                this.collectExports(child, descriptions, document);
              }
            }
          }
          // Also check the relationship itself
          this.collectExports(rel, descriptions, document);
        }
      }
    }

    // Also traverse standard Langium children
    for (const child of AstUtils.streamAst(node)) {
      if (child !== node) {
        const childName = this.getNodeName(child);
        if (childName) {
          descriptions.push(
            this.descriptions.createDescription(child, childName, document),
          );
        }
      }
    }
  }

  private getNodeName(node: AstNode): string | undefined {
    const record = node as unknown as Record<string, unknown>;
    return (record['declaredName'] as string)
        || (record['name'] as string)
        || undefined;
  }

  private isAstNode(value: unknown): value is AstNode {
    return (
      typeof value === 'object' &&
      value !== null &&
      '$type' in (value as Record<string, unknown>)
    );
  }
}
