import { GrammarUtils, type AstNode, type CstNode } from 'langium';

export const PRIMARY_NAME_PROPERTIES = ['declaredName', 'name', 'memberName'] as const;
export const SHORT_NAME_PROPERTIES = ['declaredShortName', 'shortName', 'memberShortName'] as const;
export const ALL_NAME_PROPERTIES = [...PRIMARY_NAME_PROPERTIES, ...SHORT_NAME_PROPERTIES] as const;

export type PrimaryNameProperty = (typeof PRIMARY_NAME_PROPERTIES)[number];
export type ShortNameProperty = (typeof SHORT_NAME_PROPERTIES)[number];
export type NameProperty = (typeof ALL_NAME_PROPERTIES)[number];

export interface NamedAstNode extends AstNode {
  declaredName?: unknown;
  name?: unknown;
  memberName?: unknown;
  declaredShortName?: unknown;
  shortName?: unknown;
  memberShortName?: unknown;
}

export interface AstIdentifier<Property extends NameProperty = NameProperty> {
  name: string;
  property: Property;
}

export function getPrimaryName(node: AstNode): string | undefined {
  return getNameFromProperties(node, PRIMARY_NAME_PROPERTIES);
}

export function getShortName(node: AstNode): string | undefined {
  return getNameFromProperties(node, SHORT_NAME_PROPERTIES);
}

export function getAllIdentifiers(node: AstNode): AstIdentifier[] {
  return getIdentifiersFromProperties(node, ALL_NAME_PROPERTIES);
}

export function hasIdentifier(node: AstNode): boolean {
  return getAllIdentifiers(node).length > 0;
}

export function findNameNode(cstNode: CstNode, offset?: number): CstNode | undefined {
  for (const property of ALL_NAME_PROPERTIES) {
    const node = GrammarUtils.findNodeForProperty(cstNode, property);
    if (!node) {
      continue;
    }
    if (offset === undefined) {
      return node;
    }
    const start = node.offset;
    const end = node.offset + node.length;
    if (offset >= start && offset <= end) {
      return node;
    }
  }
  return undefined;
}

function getNameFromProperties(
  node: AstNode,
  properties: readonly NameProperty[],
): string | undefined {
  return getIdentifiersFromProperties(node, properties)[0]?.name;
}

function getIdentifiersFromProperties(
  node: AstNode,
  properties: readonly NameProperty[],
): AstIdentifier[] {
  const candidate = node as NamedAstNode;
  const identifiers: AstIdentifier[] = [];

  for (const property of properties) {
    const value = candidate[property];
    if (typeof value === 'string' && value.length > 0) {
      identifiers.push({ name: value, property });
    }
  }

  return identifiers;
}