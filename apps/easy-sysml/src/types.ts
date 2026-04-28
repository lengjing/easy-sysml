export type ElementType = 
  | 'Requirement' 
  | 'Block' 
  | 'Actor' 
  | 'UseCase' 
  | 'State' 
  | 'Activity' 
  | 'Constraint' 
  | 'Behavior' 
  | 'Package' 
  | 'Class' 
  | 'Part' 
  | 'Attribute' 
  | 'Operation' 
  | 'Port' 
  | 'Action' 
  | 'Interface'
  | 'DataType';

export type ElementStatus = 'Verified' | 'Failed' | 'Review' | 'Draft';

export interface ModelElement {
  id: string;
  name: string;
  type: ElementType;
  description?: string;
  properties?: Record<string, any>;
  parentId?: string;
  status?: ElementStatus;
  children?: any[];
}

export interface Relationship {
  id: string;
  sourceId: string;
  targetId: string;
  type: 'Satisfy' | 'Verify' | 'Allocate' | 'Refine' | 'Composition' | 'Generalization';
}

export interface Diagram {
  id: string;
  name: string;
  type: 'BDD' | 'IBD' | 'ActD' | 'SeqD' | 'StM' | 'UCD' | 'RequirementD';
  nodes: any[];
  edges: any[];
}

export interface Project {
  id: string;
  name: string;
  elements: ModelElement[];
  relationships: Relationship[];
  diagrams: Diagram[];
}
