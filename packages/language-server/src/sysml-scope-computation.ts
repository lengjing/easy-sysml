/**
 * SysML Scope Computation
 *
 * Traverses SysML's relationship-based AST to find and export named elements.
 *
 * SysML nests named elements inside Membership relationships:
 *   Package → ownedRelationship → OwningMembership → ownedRelatedElement → PartDefinition
 *
 * The default Langium ScopeComputation doesn't know about this structure.
 */

import type {
  AstNode,
  AstNodeDescription,
  LangiumDocument,
  LangiumCoreServices,
  ScopeComputation,
} from 'langium';
import { MultiMap } from 'langium';
import type { LocalSymbols } from 'langium';

/* eslint-disable @typescript-eslint/no-explicit-any */

export class SysMLScopeComputation implements ScopeComputation {
  private readonly services: LangiumCoreServices;

  constructor(services: LangiumCoreServices) {
    this.services = services;
  }

  async collectExportedSymbols(document: LangiumDocument): Promise<AstNodeDescription[]> {
    const exports: AstNodeDescription[] = [];
    const root = document.parseResult?.value;
    if (!root) return exports;
    this.collectExports(root, exports, document);
    return exports;
  }

  async collectLocalSymbols(document: LangiumDocument): Promise<LocalSymbols> {
    const scopes = new MultiMap<AstNode, AstNodeDescription>();
    const root = document.parseResult?.value;
    if (!root) return scopes;
    this.computeScopes(root, scopes, document);
    return scopes;
  }

  private collectExports(
    node: AstNode,
    exports: AstNodeDescription[],
    document: LangiumDocument,
  ): void {
    const name = this.getName(node);
    if (name) {
      exports.push(this.createDescription(node, name, document));

      const container = (node as any).$container as AstNode | undefined;
      if (container && this.isMembership(container)) {
        exports.push(this.createDescription(container, name, document));
      }

      // Conjugated port definition (synthetic ~Name entry per SysML v2 spec)
      if (node.$type === 'PortDefinition') {
        exports.push({
          ...this.createDescription(node, '~' + name, document),
          type: 'ConjugatedPortDefinition',
        });
      }
    }

    // Short name support
    const shortName = this.getShortName(node);
    if (shortName && shortName !== name) {
      exports.push(this.createDescription(node, shortName, document));
    }

    this.traverseChildren(node, (child) => this.collectExports(child, exports, document));
  }

  private computeScopes(
    node: AstNode,
    scopes: MultiMap<AstNode, AstNodeDescription>,
    document: LangiumDocument,
  ): void {
    if (this.isNamespace(node)) {
      this.traverseChildren(node, (child) => {
        const childName = this.getName(child);
        if (childName) {
          scopes.add(node, this.createDescription(child, childName, document));
        }
        const childShort = this.getShortName(child);
        if (childShort && childShort !== childName) {
          scopes.add(node, this.createDescription(child, childShort, document));
        }
      });
    }

    this.traverseChildren(node, (child) => this.computeScopes(child, scopes, document));
  }

  private getName(node: AstNode): string | undefined {
    const n = node as any;
    return n.declaredName ?? n.name ?? n.memberName ?? undefined;
  }

  private getShortName(node: AstNode): string | undefined {
    const n = node as any;
    return n.declaredShortName ?? n.shortName ?? n.memberShortName ?? undefined;
  }

  private isMembership(node: AstNode): boolean {
    const t = node.$type;
    return t === 'Membership' || t === 'OwningMembership' ||
           t === 'FeatureMembership' || t === 'EndFeatureMembership' ||
           (typeof t === 'string' && t.endsWith('Membership'));
  }

  private isNamespace(node: AstNode): boolean {
    const t = node.$type;
    return t === 'Namespace' || t === 'Package' || t === 'LibraryPackage' ||
           t === 'RootNamespace' || (typeof t === 'string' && t.endsWith('Definition')) ||
           (typeof t === 'string' && t.endsWith('Usage')) ||
           t === 'Type' || t === 'Class' || t === 'Classifier' || t === 'Feature';
  }

  private traverseChildren(node: AstNode, callback: (child: AstNode) => void): void {
    const n = node as any;

    if (Array.isArray(n.ownedRelationship)) {
      for (const rel of n.ownedRelationship) {
        if (Array.isArray(rel?.ownedRelatedElement)) {
          for (const elem of rel.ownedRelatedElement) callback(elem);
        } else if (rel?.ownedRelatedElement && typeof rel.ownedRelatedElement === 'object') {
          callback(rel.ownedRelatedElement);
        }
        if (rel?.memberElement && typeof rel.memberElement === 'object') {
          callback(rel.memberElement);
        }
        if (rel?.ownedMemberElement && typeof rel.ownedMemberElement === 'object') {
          callback(rel.ownedMemberElement);
        }
      }
    }

    if (Array.isArray(n.ownedMember)) {
      for (const member of n.ownedMember) callback(member);
    }
  }

  private createDescription(
    node: AstNode,
    name: string,
    document: LangiumDocument,
  ): AstNodeDescription {
    return {
      node,
      name,
      type: node.$type,
      documentUri: document.uri,
      path: this.services.workspace.AstNodeLocator.getAstNodePath(node),
    };
  }
}
