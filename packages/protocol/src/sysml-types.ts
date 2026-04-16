// ---------------------------------------------------------------------------
// SysML v2 domain types
// ---------------------------------------------------------------------------

import type { Range } from './lsp-types.js';

/** Enumeration of all supported SysML v2 element kinds. */
export const enum SysMLElementKind {
  Package = 'Package',
  PartDefinition = 'PartDefinition',
  PartUsage = 'PartUsage',
  AttributeDefinition = 'AttributeDefinition',
  AttributeUsage = 'AttributeUsage',
  ActionDefinition = 'ActionDefinition',
  ActionUsage = 'ActionUsage',
  StateDefinition = 'StateDefinition',
  StateUsage = 'StateUsage',
  RequirementDefinition = 'RequirementDefinition',
  RequirementUsage = 'RequirementUsage',
  PortDefinition = 'PortDefinition',
  PortUsage = 'PortUsage',
  ConnectionDefinition = 'ConnectionDefinition',
  ConnectionUsage = 'ConnectionUsage',
  InterfaceDefinition = 'InterfaceDefinition',
  InterfaceUsage = 'InterfaceUsage',
  ItemDefinition = 'ItemDefinition',
  ItemUsage = 'ItemUsage',
  FlowConnectionDefinition = 'FlowConnectionDefinition',
  FlowConnectionUsage = 'FlowConnectionUsage',
  Comment = 'Comment',
  Documentation = 'Documentation',
  Import = 'Import',
  Alias = 'Alias',
  Namespace = 'Namespace',
  Feature = 'Feature',
  Connector = 'Connector',
  Specialization = 'Specialization',
  Redefinition = 'Redefinition',
  Subsetting = 'Subsetting',
  FeatureTyping = 'FeatureTyping',
  Conjugation = 'Conjugation',
  Dependency = 'Dependency',
  Multiplicity = 'Multiplicity',
  LiteralInteger = 'LiteralInteger',
  LiteralString = 'LiteralString',
  LiteralReal = 'LiteralReal',
  LiteralBoolean = 'LiteralBoolean',
  MetadataFeature = 'MetadataFeature',
  AnnotatingElement = 'AnnotatingElement',
  Constraint = 'Constraint',
  Enumeration = 'Enumeration',
}

/** SysML v2 visibility qualifiers. */
export const enum VisibilityKind {
  Public = 'public',
  Private = 'private',
  Protected = 'protected',
}

/** Kinds of relationships between SysML elements. */
export const enum RelationshipKind {
  Specialization = 'Specialization',
  Redefinition = 'Redefinition',
  Subsetting = 'Subsetting',
  FeatureTyping = 'FeatureTyping',
  Conjugation = 'Conjugation',
  Dependency = 'Dependency',
  Import = 'Import',
  Membership = 'Membership',
  OwningMembership = 'OwningMembership',
  FeatureMembership = 'FeatureMembership',
  Connector = 'Connector',
  Connection = 'Connection',
  FlowConnection = 'FlowConnection',
}

/** A single SysML element within a model. */
export interface SysMLElement {
  readonly id: string;
  readonly kind: SysMLElementKind;
  readonly name?: string;
  readonly qualifiedName?: string;
  readonly visibility?: VisibilityKind;
  readonly range?: Range;
  readonly children?: SysMLElement[];
  readonly metadata?: Record<string, unknown>;
}

/** A relationship between two SysML elements. */
export interface SysMLRelationship {
  readonly id: string;
  readonly kind: RelationshipKind;
  readonly sourceId: string;
  readonly targetId: string;
  readonly metadata?: Record<string, unknown>;
}

/** Top-level SysML v2 model container. */
export interface SysMLModel {
  readonly uri: string;
  readonly elements: SysMLElement[];
  readonly relationships: SysMLRelationship[];
}
