// ---------------------------------------------------------------------------
// Renderer / visualization types
// ---------------------------------------------------------------------------

/** A 2-D point used for layout positions. */
export interface Point {
  readonly x: number;
  readonly y: number;
}

/** Dimensions of a rectangular area. */
export interface Size {
  readonly width: number;
  readonly height: number;
}

/** A node in a graph visualization. */
export interface GraphNode {
  readonly id: string;
  readonly type: string;
  readonly label: string;
  readonly position: Point;
  readonly data?: Record<string, unknown>;
}

/** An edge connecting two nodes in a graph visualization. */
export interface GraphEdge {
  readonly id: string;
  readonly source: string;
  readonly target: string;
  readonly type?: string;
  readonly label?: string;
}

/** Describes the computed layout of a graph. */
export interface GraphLayout {
  readonly nodes: GraphNode[];
  readonly edges: GraphEdge[];
  readonly size?: Size;
}

/** Current viewport state of the graph renderer. */
export interface ViewportState {
  readonly x: number;
  readonly y: number;
  readonly zoom: number;
}
