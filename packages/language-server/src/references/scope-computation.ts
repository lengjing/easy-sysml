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
import { getPrimaryName, getShortName, hasIdentifier } from '../ast-names.js';

export class SysMLScopeComputation implements ScopeComputation {
  private readonly services: LangiumCoreServices;

  constructor(services: LangiumCoreServices) {
    this.services = services;
  }

  async collectExportedSymbols(document: LangiumDocument): Promise<AstNodeDescription[]> {
    const exports: AstNodeDescription[] = [];
    const root = document.parseResult?.value;
    if (!root) return exports;
    this.collectExports(root, exports, document, []);
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
    qualifiedPrefix: string[],
  ): void {
    const name = getPrimaryName(node);
    if (name) {
      exports.push(this.createDescription(node, name, document));

      if (qualifiedPrefix.length > 0) {
        for (let i = 0; i < qualifiedPrefix.length; i++) {
          const qn = [...qualifiedPrefix.slice(i), name].join('::');
          exports.push(this.createDescription(node, qn, document));
        }
      }

      const container = (node as any).$container as AstNode | undefined;
      if (container && this.isMembership(container)) {
        exports.push(this.createDescription(container, name, document));
      }

      if (node.$type === 'PortDefinition') {
        const conjugatedName = '~' + name;
        exports.push({
          ...this.createDescription(node, conjugatedName, document),
          type: 'ConjugatedPortDefinition',
        });
        for (let i = 0; i < qualifiedPrefix.length; i++) {
          exports.push({
            ...this.createDescription(node, [...qualifiedPrefix.slice(i), conjugatedName].join('::'), document),
            type: 'ConjugatedPortDefinition',
          });
        }
      }
    }

    const shortName = getShortName(node);
    if (shortName && shortName !== name) {
      exports.push(this.createDescription(node, shortName, document));
      for (let i = 0; i < qualifiedPrefix.length; i++) {
        exports.push(this.createDescription(node, [...qualifiedPrefix.slice(i), shortName].join('::'), document));
      }
    }

    const childPrefix = name && this.isNamespace(node) ? [...qualifiedPrefix, name] : qualifiedPrefix;
    this.traverseChildren(node, (child) => this.collectExports(child, exports, document, childPrefix));
  }

  private computeScopes(
    node: AstNode,
    scopes: MultiMap<AstNode, AstNodeDescription>,
    document: LangiumDocument,
  ): void {
    if (this.isNamespace(node)) {
      this.traverseChildren(node, (child) => {
        const childName = getPrimaryName(child);
        if (childName) {
          scopes.add(node, this.createDescription(child, childName, document));
        }
        const childShort = getShortName(child);
        if (childShort && childShort !== childName) {
          scopes.add(node, this.createDescription(child, childShort, document));
        }
      });
    }

    this.traverseChildren(node, (child) => this.computeScopes(child, scopes, document));
  }

  private isMembership(node: AstNode): boolean {
    const t = node.$type;
    return t === 'Membership' || t === 'OwningMembership' ||
           t === 'FeatureMembership' || t === 'EndFeatureMembership' ||
           (typeof t === 'string' && t.endsWith('Membership'));
  }

  private isNamespace(node: AstNode): boolean {
    const n = node as any;
    if (Array.isArray(n.ownedRelationship) && n.ownedRelationship.length > 0) {
      return true;
    }
    const t = node.$type;
    return t === 'Namespace' || t === 'Package' || t === 'LibraryPackage' ||
           t === 'RootNamespace';
  }

  private traverseChildren(node: AstNode, callback: (child: AstNode) => void): void {
    const n = node as any;
    const seen = new Set<unknown>();
    const emit = (child: unknown) => {
      if (child && typeof child === 'object' && '$type' in (child as any) && !seen.has(child)) {
        seen.add(child);
        callback(child as AstNode);
      }
    };

    if (Array.isArray(n.ownedRelationship)) {
      for (const rel of n.ownedRelationship) {
        if (rel && typeof rel === 'object' && '$type' in rel && hasIdentifier(rel as AstNode)) {
          emit(rel);
        }
        if (Array.isArray(rel?.ownedRelatedElement)) {
          for (const elem of rel.ownedRelatedElement) emit(elem);
        } else if (rel?.ownedRelatedElement) {
          emit(rel.ownedRelatedElement);
        }
        if (rel?.ownedMemberElement) {
          emit(rel.ownedMemberElement);
        }
      }
    }

    if (Array.isArray(n.ownedMember)) {
      for (const member of n.ownedMember) emit(member);
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