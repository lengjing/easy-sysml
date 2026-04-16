import type {
  PackageNode,
  PartDefinitionNode,
  PartUsageNode,
  AttributeUsageNode,
  CommentNode,
} from './nodes.js';

let counter = 0;
function makeId(): string {
  return `ast-${Date.now()}-${++counter}`;
}

/** Create a Package node */
export function createPackage(name: string): PackageNode {
  return {
    $type: 'Package',
    $id: makeId(),
    name,
    members: [],
    imports: [],
  };
}

/** Create a PartDefinition node */
export function createPartDefinition(name: string, isAbstract = false): PartDefinitionNode {
  return {
    $type: 'PartDefinition',
    $id: makeId(),
    name,
    isAbstract,
    members: [],
    specializations: [],
  };
}

/** Create a PartUsage node */
export function createPartUsage(name: string): PartUsageNode {
  return {
    $type: 'PartUsage',
    $id: makeId(),
    name,
    typings: [],
    members: [],
  };
}

/** Create an AttributeUsage node */
export function createAttributeUsage(name: string): AttributeUsageNode {
  return {
    $type: 'AttributeUsage',
    $id: makeId(),
    name,
    typings: [],
  };
}

/** Create a Comment node */
export function createComment(body: string): CommentNode {
  return {
    $type: 'Comment',
    $id: makeId(),
    body,
  };
}
