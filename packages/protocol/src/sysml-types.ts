/** Unique identifier for model elements */
export type UUID = string;

/** SysML v2 element metatypes */
export enum SysMLMetatype {
  // KerML Core
  NAMESPACE = 'Namespace',
  PACKAGE = 'Package',
  TYPE = 'Type',
  CLASSIFIER = 'Classifier',
  CLASS = 'Class',
  DATA_TYPE = 'DataType',
  FEATURE = 'Feature',
  MULTIPLICITY = 'Multiplicity',

  // SysML Definitions
  PART_DEFINITION = 'PartDefinition',
  ATTRIBUTE_DEFINITION = 'AttributeDefinition',
  PORT_DEFINITION = 'PortDefinition',
  INTERFACE_DEFINITION = 'InterfaceDefinition',
  CONNECTION_DEFINITION = 'ConnectionDefinition',
  FLOW_DEFINITION = 'FlowDefinition',
  ACTION_DEFINITION = 'ActionDefinition',
  STATE_DEFINITION = 'StateDefinition',
  CALCULATION_DEFINITION = 'CalculationDefinition',
  CONSTRAINT_DEFINITION = 'ConstraintDefinition',
  REQUIREMENT_DEFINITION = 'RequirementDefinition',
  CASE_DEFINITION = 'CaseDefinition',
  ANALYSIS_CASE_DEFINITION = 'AnalysisCaseDefinition',
  VERIFICATION_CASE_DEFINITION = 'VerificationCaseDefinition',
  USE_CASE_DEFINITION = 'UseCaseDefinition',
  VIEW_DEFINITION = 'ViewDefinition',
  VIEWPOINT_DEFINITION = 'ViewpointDefinition',
  RENDERING_DEFINITION = 'RenderingDefinition',
  ALLOCATION_DEFINITION = 'AllocationDefinition',

  // SysML Usages
  PART_USAGE = 'PartUsage',
  ATTRIBUTE_USAGE = 'AttributeUsage',
  PORT_USAGE = 'PortUsage',
  INTERFACE_USAGE = 'InterfaceUsage',
  CONNECTION_USAGE = 'ConnectionUsage',
  FLOW_USAGE = 'FlowUsage',
  ACTION_USAGE = 'ActionUsage',
  STATE_USAGE = 'StateUsage',
  CALCULATION_USAGE = 'CalculationUsage',
  CONSTRAINT_USAGE = 'ConstraintUsage',
  REQUIREMENT_USAGE = 'RequirementUsage',
  CASE_USAGE = 'CaseUsage',
  ANALYSIS_CASE_USAGE = 'AnalysisCaseUsage',
  VERIFICATION_CASE_USAGE = 'VerificationCaseUsage',
  USE_CASE_USAGE = 'UseCaseUsage',
  VIEW_USAGE = 'ViewUsage',
  VIEWPOINT_USAGE = 'ViewpointUsage',
  RENDERING_USAGE = 'RenderingUsage',
  ALLOCATION_USAGE = 'AllocationUsage',
  ITEM_USAGE = 'ItemUsage',
  ITEM_DEFINITION = 'ItemDefinition',

  // Relationships
  SPECIALIZATION = 'Specialization',
  CONJUGATION = 'Conjugation',
  FEATURE_TYPING = 'FeatureTyping',
  SUBSETTING = 'Subsetting',
  REDEFINITION = 'Redefinition',
  MEMBERSHIP = 'Membership',
  IMPORT = 'Import',

  // Other
  COMMENT = 'Comment',
  DOCUMENTATION = 'Documentation',
  METADATA_USAGE = 'MetadataUsage',
  METADATA_DEFINITION = 'MetadataDefinition',
  LITERAL_INTEGER = 'LiteralInteger',
  LITERAL_REAL = 'LiteralReal',
  LITERAL_STRING = 'LiteralString',
  LITERAL_BOOLEAN = 'LiteralBoolean',
}

/** Relationship edge types */
export enum EdgeType {
  SPECIALIZATION = 'specialization',
  TYPING = 'typing',
  FEATURE_MEMBERSHIP = 'featureMembership',
  SATISFY = 'satisfy',
  REFINE = 'refine',
  DERIVE = 'derive',
  REDEFINITION = 'redefinition',
  SUBSETTING = 'subsetting',
  CONJUGATION = 'conjugation',
  IMPORT = 'import',
  ALLOCATION = 'allocation',
  CONNECTION = 'connection',
  FLOW = 'flow',
  DEPENDENCY = 'dependency',
}

/** Diagnostic severity levels */
export enum DiagnosticSeverity {
  ERROR = 1,
  WARNING = 2,
  INFORMATION = 3,
  HINT = 4,
}
