// ---------------------------------------------------------------------------
// Stable Node ID system for deterministic AST node identification
// ---------------------------------------------------------------------------

/**
 * A stable, path-based node identifier.
 * Format: "kind:name/kind:name/..." e.g. "pkg:Vehicle/part:engine/attr:displacement"
 */
export type NodeId = string & { readonly __brand: unique symbol };

/** A parsed segment of a NodeId. */
export interface NodeIdSegment {
  readonly kind: string;
  readonly name: string;
}

const SEPARATOR = '/';
const KIND_DELIMITER = ':';

/**
 * Generate a deterministic NodeId by appending a new segment to a parent path.
 * If parent is null, the new segment becomes the root.
 */
export function generateNodeId(
  parent: NodeId | null,
  kind: string,
  name: string,
): NodeId {
  const segment = `${encodeSegmentPart(kind)}${KIND_DELIMITER}${encodeSegmentPart(name)}`;
  if (parent === null || parent === '') {
    return segment as NodeId;
  }
  return `${parent}${SEPARATOR}${segment}` as NodeId;
}

/**
 * Parse a NodeId into its constituent segments.
 */
export function parseNodeId(id: NodeId): { segments: NodeIdSegment[] } {
  if (!id || id === '') {
    return { segments: [] };
  }
  const parts = id.split(SEPARATOR);
  const segments: NodeIdSegment[] = parts.map((part) => {
    const delimIdx = part.indexOf(KIND_DELIMITER);
    if (delimIdx === -1) {
      return { kind: '', name: decodeSegmentPart(part) };
    }
    return {
      kind: decodeSegmentPart(part.slice(0, delimIdx)),
      name: decodeSegmentPart(part.slice(delimIdx + 1)),
    };
  });
  return { segments };
}

/**
 * Check whether `child` is a descendant of `ancestor` in the ID hierarchy.
 */
export function isDescendantOf(child: NodeId, ancestor: NodeId): boolean {
  if (!child || !ancestor) {
    return false;
  }
  if (child === ancestor) {
    return false;
  }
  return child.startsWith(ancestor + SEPARATOR);
}

// Encode separator and delimiter characters so names can contain them safely.
function encodeSegmentPart(value: string): string {
  return value
    .replace(/%/g, '%25')
    .replace(/\//g, '%2F')
    .replace(/:/g, '%3A');
}

function decodeSegmentPart(value: string): string {
  return value
    .replace(/%3A/gi, ':')
    .replace(/%2F/gi, '/')
    .replace(/%25/g, '%');
}
