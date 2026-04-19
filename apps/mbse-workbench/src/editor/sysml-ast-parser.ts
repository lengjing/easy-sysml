/**
 * SysML AST-based Parser
 *
 * Uses the Langium-generated parser from @easy-sysml/grammar to parse
 * SysML v2 source code into a domain model suitable for ReactFlow
 * visualization, and provides targeted source editing operations.
 */
import { parseSysML } from '@easy-sysml/grammar';
import { CstUtils, type AstNode, type CstNode } from 'langium';

/* ------------------------------------------------------------------ */
/*  Domain model types                                                */
/* ------------------------------------------------------------------ */

export interface DomainElement {
  /** Unique ID derived from the element's qualified name path */
  id: string;
  /** Display name */
  name: string;
  /** SysML element type for display (e.g. 'Package', 'PartDefinition', 'PartUsage', etc.) */
  type: string;
  /** Description from doc comments if available */
  description: string;
  /** Attribute properties extracted from attribute usages */
  properties: Record<string, string>;
  /** Child elements */
  children: DomainElement[];
  /** Source range in the original text (0-based offsets) */
  sourceRange: { startOffset: number; endOffset: number };
  /** The qualified name path (e.g. ['Vehicle', 'Wheel']) for building unique IDs */
  path: string[];
}

export interface DomainEdge {
  /** Source element ID */
  sourceId: string;
  /** Target element ID */
  targetId: string;
  /** Relationship type */
  type: string;
}

export interface DomainModel {
  elements: DomainElement[];
  edges: DomainEdge[];
  errors: Array<{ message: string; line: number; column: number }>;
}

/* ------------------------------------------------------------------ */
/*  AST type mapping                                                  */
/* ------------------------------------------------------------------ */

const TYPE_MAP: Record<string, string> = {
  Package: 'Package',
  PartDefinition: 'PartDefinition',
  PartUsage: 'Part',
  AttributeDefinition: 'AttributeDefinition',
  AttributeUsage: 'Attribute',
  PortDefinition: 'PortDefinition',
  PortUsage: 'Port',
  ActionDefinition: 'ActionDefinition',
  ActionUsage: 'Action',
  StateDefinition: 'StateDefinition',
  StateUsage: 'State',
  RequirementDefinition: 'RequirementDefinition',
  RequirementUsage: 'Requirement',
  ConstraintDefinition: 'ConstraintDefinition',
  ConstraintUsage: 'Constraint',
  ConnectionDefinition: 'ConnectionDefinition',
  InterfaceDefinition: 'InterfaceDefinition',
};

function mapAstType(astType: string): string {
  return TYPE_MAP[astType] ?? astType;
}

/* ------------------------------------------------------------------ */
/*  AST helpers                                                       */
/* ------------------------------------------------------------------ */

function getNodeName(node: AstNode): string | undefined {
  const n = node as unknown as Record<string, unknown>;
  for (const prop of ['declaredName', 'name', 'shortName']) {
    if (typeof n[prop] === 'string' && (n[prop] as string).length > 0) {
      return n[prop] as string;
    }
  }
  return undefined;
}

function getDocComment(node: AstNode): string {
  const content = node as unknown as Record<string, unknown>;
  const rels = content['ownedRelationship'];
  if (!Array.isArray(rels)) return '';

  for (const rel of rels) {
    if (!rel || typeof rel !== 'object') continue;
    const relObj = rel as Record<string, unknown>;

    // Documentation nodes are wrapped in memberships
    const owned = relObj['ownedRelatedElement'];
    if (Array.isArray(owned)) {
      for (const child of owned) {
        if (!child || typeof child !== 'object') continue;
        const childObj = child as Record<string, unknown>;
        if (childObj['$type'] === 'Documentation' || childObj['$type'] === 'Comment') {
          const body = childObj['body'] as string | undefined;
          if (body) {
            return body.replace(/^\/\*\s*/, '').replace(/\s*\*\/$/, '').trim();
          }
        }
      }
    }

    // Direct documentation/comment node in relationship
    if (relObj['$type'] === 'Documentation' || relObj['$type'] === 'Comment') {
      const body = relObj['body'] as string | undefined;
      if (body) {
        return body.replace(/^\/\*\s*/, '').replace(/\s*\*\/$/, '').trim();
      }
    }
  }
  return '';
}

/**
 * Walk AST nodes accessible through ownedRelationship → ownedRelatedElement,
 * collecting named domain elements.
 */
function walkAst(
  node: AstNode,
  path: string[],
  visited: Set<AstNode>,
): DomainElement[] {
  if (visited.has(node)) return [];
  visited.add(node);

  const results: DomainElement[] = [];
  const name = getNodeName(node);
  const nodeType = node.$type;

  // Collect children from ownedRelationship
  const childElements: DomainElement[] = [];
  const properties: Record<string, string> = {};

  const content = node as unknown as Record<string, unknown>;
  const rels = content['ownedRelationship'];

  if (Array.isArray(rels)) {
    for (const rel of rels) {
      if (!rel || typeof rel !== 'object' || visited.has(rel as AstNode)) continue;
      const relObj = rel as Record<string, unknown>;

      // Each relationship may wrap elements in ownedRelatedElement
      const ownedElements = relObj['ownedRelatedElement'];
      if (Array.isArray(ownedElements)) {
        for (const child of ownedElements) {
          if (!child || typeof child !== 'object' || !('$type' in child)) continue;
          const childNode = child as AstNode;
          if (visited.has(childNode)) continue;

          const childName = getNodeName(childNode);
          const childType = childNode.$type;

          // AttributeUsage children become properties
          if (childName && (childType === 'AttributeUsage' || childType === 'AttributeDefinition')) {
            // Try to get a default value from the attribute
            const childContent = childNode as unknown as Record<string, unknown>;
            const valExpr = childContent['valueExpression'] ?? childContent['value'];
            let extractedValue = '';
            if (valExpr && typeof valExpr === 'object') {
              const exprObj = valExpr as Record<string, unknown>;
              const literal = exprObj['literal'] ?? exprObj['value'];
              if (typeof literal === 'string') {
                extractedValue = literal;
              }
            }
            properties[childName] = extractedValue;

            // Also track as child element for structure
            const newPath = name ? [...path, name] : path;
            const childResults = walkAst(childNode, newPath, visited);
            if (childResults.length > 0) {
              childElements.push(...childResults);
            } else {
              visited.add(childNode);
            }
          } else {
            // Recurse into non-attribute children
            const newPath = name ? [...path, name] : path;
            childElements.push(...walkAst(childNode, newPath, visited));
          }
        }
      }

      // Also check if the relationship itself is a named element
      if ('$type' in relObj) {
        const relNode = rel as AstNode;
        const relName = getNodeName(relNode);
        if (relName && !visited.has(relNode)) {
          const relType = relNode.$type;
          if (relType === 'AttributeUsage' || relType === 'AttributeDefinition') {
            if (!(relName in properties)) {
              properties[relName] = '';
            }
            visited.add(relNode);
          } else {
            const newPath = name ? [...path, name] : path;
            childElements.push(...walkAst(relNode, newPath, visited));
          }
        }
      }
    }
  }

  // Also walk non-$ array properties for children (fallback for non-standard structures)
  for (const [key, val] of Object.entries(content)) {
    if (key.startsWith('$') || key === 'ownedRelationship') continue;
    if (Array.isArray(val)) {
      for (const item of val) {
        if (item && typeof item === 'object' && '$type' in item) {
          const astItem = item as AstNode;
          if (!visited.has(astItem)) {
            const childName = getNodeName(astItem);
            if (childName) {
              const newPath = name ? [...path, name] : path;
              childElements.push(...walkAst(astItem, newPath, visited));
            }
          }
        }
      }
    }
  }

  if (name) {
    const elementPath = [...path, name];
    const id = elementPath.join('::');

    const element: DomainElement = {
      id,
      name,
      type: mapAstType(nodeType),
      description: getDocComment(node),
      properties,
      children: childElements,
      sourceRange: node.$cstNode
        ? { startOffset: node.$cstNode.offset, endOffset: node.$cstNode.end }
        : { startOffset: 0, endOffset: 0 },
      path: elementPath,
    };

    results.push(element);
  } else {
    // Unnamed node (e.g. root Namespace) — promote children
    results.push(...childElements);
  }

  return results;
}

/* ------------------------------------------------------------------ */
/*  CST helpers for source editing                                    */
/* ------------------------------------------------------------------ */

function findNameTokenOffset(
  cstNode: CstNode,
  name: string,
): { offset: number; length: number } | undefined {
  const leafNodes = CstUtils.flattenCst(cstNode);
  for (const leaf of leafNodes) {
    if (leaf.text === name && !leaf.hidden) {
      return { offset: leaf.offset, length: leaf.length };
    }
  }
  return undefined;
}

/* ------------------------------------------------------------------ */
/*  Public API                                                        */
/* ------------------------------------------------------------------ */

/**
 * Parse SysML source code into a domain model for visualization.
 */
export function parseSysMLToDomainModel(source: string): DomainModel {
  const result = parseSysML(source);

  const errors = [
    ...result.parserErrors.map((e) => ({
      message: e.message,
      line: e.line,
      column: e.column,
    })),
    ...result.lexerErrors.map((e) => ({
      message: e.message,
      line: e.line,
      column: e.column,
    })),
  ];

  const visited = new Set<AstNode>();
  const elements = walkAst(result.ast, [], visited);

  return { elements, edges: [], errors };
}

/**
 * Apply an element rename by replacing ONLY the name token at its exact
 * CST offset (not a global search-and-replace).
 */
export function applyElementRename(
  source: string,
  elementId: string,
  newName: string,
  model: DomainModel,
): string {
  const element = findElementById(model.elements, elementId);
  if (!element) return source;

  // Re-parse to get fresh CST nodes (the model's elements don't carry
  // live CST references because the model may have been serialized).
  const result = parseSysML(source);
  const targetNode = findAstNodeByPath(result.ast, element.path, new Set());
  if (!targetNode?.$cstNode) return source;

  const token = findNameTokenOffset(targetNode.$cstNode, element.name);
  if (!token) return source;

  return (
    source.slice(0, token.offset) +
    newName +
    source.slice(token.offset + token.length)
  );
}

/**
 * Apply a property value change at a targeted source location.
 */
export function applyPropertyChange(
  source: string,
  elementId: string,
  propertyName: string,
  newValue: string,
  model: DomainModel,
): string {
  const element = findElementById(model.elements, elementId);
  if (!element) return source;

  // Re-parse for fresh CST
  const result = parseSysML(source);
  const targetNode = findAstNodeByPath(result.ast, element.path, new Set());
  if (!targetNode) return source;

  // Find the property child (AttributeUsage named `propertyName`)
  const content = targetNode as unknown as Record<string, unknown>;
  const rels = content['ownedRelationship'];
  if (!Array.isArray(rels)) return source;

  for (const rel of rels) {
    if (!rel || typeof rel !== 'object') continue;
    const relObj = rel as Record<string, unknown>;
    const owned = relObj['ownedRelatedElement'];
    if (!Array.isArray(owned)) continue;

    for (const child of owned) {
      if (!child || typeof child !== 'object' || !('$type' in child)) continue;
      const childNode = child as AstNode;
      const childName = getNodeName(childNode);
      if (childName === propertyName && childNode.$cstNode) {
        // Replace the entire attribute usage text with updated value
        const attrStart = childNode.$cstNode.offset;
        const attrEnd = childNode.$cstNode.end;
        const originalText = source.slice(attrStart, attrEnd);

        // Replace just the value portion after the colon.
        // Handles common forms: `attribute x : Type`, `attribute x : "value"`.
        const valueMatch = originalText.match(/(:)\s*("(?:[^"\\]|\\.)*"|\S+)/);
        if (valueMatch && valueMatch.index !== undefined) {
          const valueStart = attrStart + valueMatch.index + valueMatch[1].length;
          const valueEnd = valueStart + valueMatch[0].length - valueMatch[1].length;
          return (
            source.slice(0, valueStart) +
            ' ' + newValue +
            source.slice(valueEnd)
          );
        }
        return source;
      }
    }
  }

  return source;
}

/* ------------------------------------------------------------------ */
/*  Internal helpers                                                  */
/* ------------------------------------------------------------------ */

function findElementById(
  elements: DomainElement[],
  id: string,
): DomainElement | undefined {
  for (const el of elements) {
    if (el.id === id) return el;
    const found = findElementById(el.children, id);
    if (found) return found;
  }
  return undefined;
}

/**
 * Walk the AST following a qualified name path to find the target node.
 */
function findAstNodeByPath(
  node: AstNode,
  path: string[],
  visited: Set<AstNode>,
): AstNode | undefined {
  if (visited.has(node)) return undefined;
  visited.add(node);

  const name = getNodeName(node);

  if (path.length === 0) return undefined;

  if (name === path[0]) {
    if (path.length === 1) return node;
    // Continue searching children for the remaining path
    return findChildByPath(node, path.slice(1), visited);
  }

  // Current node is unnamed (e.g. root) — search children at current level
  return findChildByPath(node, path, visited);
}

function findChildByPath(
  node: AstNode,
  path: string[],
  visited: Set<AstNode>,
): AstNode | undefined {
  const content = node as unknown as Record<string, unknown>;

  for (const [key, val] of Object.entries(content)) {
    if (key.startsWith('$')) continue;
    if (Array.isArray(val)) {
      for (const item of val) {
        if (item && typeof item === 'object' && '$type' in item) {
          const astItem = item as AstNode;
          // Check ownedRelatedElement for wrapped elements
          const relContent = astItem as unknown as Record<string, unknown>;
          const owned = relContent['ownedRelatedElement'];
          if (Array.isArray(owned)) {
            for (const child of owned) {
              if (child && typeof child === 'object' && '$type' in child) {
                const result = findAstNodeByPath(child as AstNode, path, visited);
                if (result) return result;
              }
            }
          }
          const result = findAstNodeByPath(astItem, path, visited);
          if (result) return result;
        }
      }
    }
  }
  return undefined;
}

export { findElementById };
