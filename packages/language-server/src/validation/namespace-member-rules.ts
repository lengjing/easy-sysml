import { AstUtils, isAstNode, type AstNode, type ValidationAcceptor } from 'langium';
import { isAliasMember, isFeature, isNamespace, isPackage, isReferenceUsage, type Feature, type ReferenceUsage } from '@easy-sysml/grammar';
import { getAllIdentifiers, hasIdentifier, type NameProperty } from '../ast-names.js';

const STRUCTURAL_RELATIONSHIP_TYPES = new Set([
  'AliasMember',
  'FeatureMember',
  'Import',
  'NonFeatureMember',
  'PrefixMetadataMember',
]);

type NamedIdentifier = { name: string; node: AstNode; property: NameProperty };

export function validateDuplicateNamespaceMemberIdentifiers(rootNode: AstNode, accept: ValidationAcceptor): void {
  for (const node of AstUtils.streamAst(rootNode)) {
    if (!isNamespaceLike(node)) {
      continue;
    }

    const identifiersByName = new Map<string, NamedIdentifier[]>();
    for (const member of getDirectNamedMembers(node)) {
      for (const identifier of getIdentifiers(member)) {
        const existing = identifiersByName.get(identifier.name) ?? [];
        if (existing.some((candidate) => candidate.node === identifier.node && candidate.property === identifier.property)) {
          continue;
        }
        existing.push(identifier);
        identifiersByName.set(identifier.name, existing);
      }
    }

    for (const [name, duplicates] of identifiersByName) {
      if (duplicates.length < 2) {
        continue;
      }
      for (const duplicate of duplicates.slice(1)) {
        accept('error', `Duplicate member identifier '${name}' in the same namespace.`, {
          node: duplicate.node,
          property: duplicate.property,
          code: 'duplicate-namespace-member-identifier',
        });
      }
    }
  }
}

export function validateBareNamespaceFeatures(rootNode: AstNode, accept: ValidationAcceptor): void {
  for (const node of AstUtils.streamAst(rootNode)) {
    if ((!isFeature(node) && !isReferenceUsage(node)) || !isInvalidBareNamespaceDeclaration(node)) {
      continue;
    }

    accept(
      'error',
      `Unknown declaration '${node.declaredName}'. Use an explicit keyword such as 'package', 'part', or 'feature'.`,
      {
        node,
        property: 'declaredName',
        code: 'unknown-bare-declaration',
      },
    );
  }
}

function isInvalidBareNamespaceDeclaration(node: Feature | ReferenceUsage): boolean {
  if (!node.declaredName || !isNamespaceMember(node)) {
    return false;
  }

  if (
    node.direction ||
    node.isAbstract ||
    ('isComposite' in node && node.isComposite) ||
    node.isConstant ||
    node.isDerived ||
    node.isEnd ||
    node.isNonunique ||
    node.isOrdered ||
    node.isSufficient ||
    ('isPortion' in node && node.isPortion) ||
    ('isVariable' in node && node.isVariable) ||
    ('isReference' in node && node.isReference) ||
    ('isVariation' in node && node.isVariation) ||
    ('target' in node && !!node.target)
  ) {
    return false;
  }

  const text = node.$cstNode?.text?.trimStart();
  if (!text?.startsWith(node.declaredName)) {
    return false;
  }

  return node.ownedRelationship.every((relationship) => isStructuralFeatureRelationship(relationship));
}

function isStructuralFeatureRelationship(node: AstNode): boolean {
  return STRUCTURAL_RELATIONSHIP_TYPES.has(node.$type);
}

function isNamespaceLike(node: AstNode): boolean {
  return isNamespace(node) || isPackage(node);
}

function isNamespaceMember(node: Feature | ReferenceUsage): boolean {
  const membership = node.$container;
  if (!membership || membership.$type !== 'OwningMembership') {
    return false;
  }
  return isAstNode(membership.$container) && isNamespaceLike(membership.$container);
}

function getDirectNamedMembers(node: AstNode): AstNode[] {
  const owner = node as { ownedRelationship?: unknown[] };
  const members: AstNode[] = [];
  const seen = new Set<AstNode>();

  const collect = (candidate: unknown): void => {
    if (!isAstNode(candidate) || seen.has(candidate)) {
      return;
    }
    seen.add(candidate);
    members.push(candidate);
  };

  for (const relationship of owner.ownedRelationship ?? []) {
    if (!isAstNode(relationship)) {
      continue;
    }

    if (!isAliasMember(relationship) && hasIdentifier(relationship)) {
      collect(relationship);
    }

    const related = (relationship as { ownedRelatedElement?: unknown | unknown[] }).ownedRelatedElement;
    if (Array.isArray(related)) {
      for (const item of related) {
        collect(item);
      }
    } else {
      collect(related);
    }

    collect((relationship as { ownedMemberElement?: unknown }).ownedMemberElement);
  }

  return members;
}

function getIdentifiers(node: AstNode): NamedIdentifier[] {
  return getAllIdentifiers(node).map((identifier) => ({
    ...identifier,
    node,
  }));
}