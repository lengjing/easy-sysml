/** SysML v2 element metatypes */
export var SysMLMetatype;
(function (SysMLMetatype) {
    // KerML Core
    SysMLMetatype["NAMESPACE"] = "Namespace";
    SysMLMetatype["PACKAGE"] = "Package";
    SysMLMetatype["TYPE"] = "Type";
    SysMLMetatype["CLASSIFIER"] = "Classifier";
    SysMLMetatype["CLASS"] = "Class";
    SysMLMetatype["DATA_TYPE"] = "DataType";
    SysMLMetatype["FEATURE"] = "Feature";
    SysMLMetatype["MULTIPLICITY"] = "Multiplicity";
    // SysML Definitions
    SysMLMetatype["PART_DEFINITION"] = "PartDefinition";
    SysMLMetatype["ATTRIBUTE_DEFINITION"] = "AttributeDefinition";
    SysMLMetatype["PORT_DEFINITION"] = "PortDefinition";
    SysMLMetatype["INTERFACE_DEFINITION"] = "InterfaceDefinition";
    SysMLMetatype["CONNECTION_DEFINITION"] = "ConnectionDefinition";
    SysMLMetatype["FLOW_DEFINITION"] = "FlowDefinition";
    SysMLMetatype["ACTION_DEFINITION"] = "ActionDefinition";
    SysMLMetatype["STATE_DEFINITION"] = "StateDefinition";
    SysMLMetatype["CALCULATION_DEFINITION"] = "CalculationDefinition";
    SysMLMetatype["CONSTRAINT_DEFINITION"] = "ConstraintDefinition";
    SysMLMetatype["REQUIREMENT_DEFINITION"] = "RequirementDefinition";
    SysMLMetatype["CASE_DEFINITION"] = "CaseDefinition";
    SysMLMetatype["ANALYSIS_CASE_DEFINITION"] = "AnalysisCaseDefinition";
    SysMLMetatype["VERIFICATION_CASE_DEFINITION"] = "VerificationCaseDefinition";
    SysMLMetatype["USE_CASE_DEFINITION"] = "UseCaseDefinition";
    SysMLMetatype["VIEW_DEFINITION"] = "ViewDefinition";
    SysMLMetatype["VIEWPOINT_DEFINITION"] = "ViewpointDefinition";
    SysMLMetatype["RENDERING_DEFINITION"] = "RenderingDefinition";
    SysMLMetatype["ALLOCATION_DEFINITION"] = "AllocationDefinition";
    // SysML Usages
    SysMLMetatype["PART_USAGE"] = "PartUsage";
    SysMLMetatype["ATTRIBUTE_USAGE"] = "AttributeUsage";
    SysMLMetatype["PORT_USAGE"] = "PortUsage";
    SysMLMetatype["INTERFACE_USAGE"] = "InterfaceUsage";
    SysMLMetatype["CONNECTION_USAGE"] = "ConnectionUsage";
    SysMLMetatype["FLOW_USAGE"] = "FlowUsage";
    SysMLMetatype["ACTION_USAGE"] = "ActionUsage";
    SysMLMetatype["STATE_USAGE"] = "StateUsage";
    SysMLMetatype["CALCULATION_USAGE"] = "CalculationUsage";
    SysMLMetatype["CONSTRAINT_USAGE"] = "ConstraintUsage";
    SysMLMetatype["REQUIREMENT_USAGE"] = "RequirementUsage";
    SysMLMetatype["CASE_USAGE"] = "CaseUsage";
    SysMLMetatype["ANALYSIS_CASE_USAGE"] = "AnalysisCaseUsage";
    SysMLMetatype["VERIFICATION_CASE_USAGE"] = "VerificationCaseUsage";
    SysMLMetatype["USE_CASE_USAGE"] = "UseCaseUsage";
    SysMLMetatype["VIEW_USAGE"] = "ViewUsage";
    SysMLMetatype["VIEWPOINT_USAGE"] = "ViewpointUsage";
    SysMLMetatype["RENDERING_USAGE"] = "RenderingUsage";
    SysMLMetatype["ALLOCATION_USAGE"] = "AllocationUsage";
    SysMLMetatype["ITEM_USAGE"] = "ItemUsage";
    SysMLMetatype["ITEM_DEFINITION"] = "ItemDefinition";
    // Relationships
    SysMLMetatype["SPECIALIZATION"] = "Specialization";
    SysMLMetatype["CONJUGATION"] = "Conjugation";
    SysMLMetatype["FEATURE_TYPING"] = "FeatureTyping";
    SysMLMetatype["SUBSETTING"] = "Subsetting";
    SysMLMetatype["REDEFINITION"] = "Redefinition";
    SysMLMetatype["MEMBERSHIP"] = "Membership";
    SysMLMetatype["IMPORT"] = "Import";
    // Other
    SysMLMetatype["COMMENT"] = "Comment";
    SysMLMetatype["DOCUMENTATION"] = "Documentation";
    SysMLMetatype["METADATA_USAGE"] = "MetadataUsage";
    SysMLMetatype["METADATA_DEFINITION"] = "MetadataDefinition";
    SysMLMetatype["LITERAL_INTEGER"] = "LiteralInteger";
    SysMLMetatype["LITERAL_REAL"] = "LiteralReal";
    SysMLMetatype["LITERAL_STRING"] = "LiteralString";
    SysMLMetatype["LITERAL_BOOLEAN"] = "LiteralBoolean";
})(SysMLMetatype || (SysMLMetatype = {}));
/** Relationship edge types */
export var EdgeType;
(function (EdgeType) {
    EdgeType["SPECIALIZATION"] = "specialization";
    EdgeType["TYPING"] = "typing";
    EdgeType["FEATURE_MEMBERSHIP"] = "featureMembership";
    EdgeType["SATISFY"] = "satisfy";
    EdgeType["REFINE"] = "refine";
    EdgeType["DERIVE"] = "derive";
    EdgeType["REDEFINITION"] = "redefinition";
    EdgeType["SUBSETTING"] = "subsetting";
    EdgeType["CONJUGATION"] = "conjugation";
    EdgeType["IMPORT"] = "import";
    EdgeType["ALLOCATION"] = "allocation";
    EdgeType["CONNECTION"] = "connection";
    EdgeType["FLOW"] = "flow";
    EdgeType["DEPENDENCY"] = "dependency";
})(EdgeType || (EdgeType = {}));
/** Diagnostic severity levels */
export var DiagnosticSeverity;
(function (DiagnosticSeverity) {
    DiagnosticSeverity[DiagnosticSeverity["ERROR"] = 1] = "ERROR";
    DiagnosticSeverity[DiagnosticSeverity["WARNING"] = 2] = "WARNING";
    DiagnosticSeverity[DiagnosticSeverity["INFORMATION"] = 3] = "INFORMATION";
    DiagnosticSeverity[DiagnosticSeverity["HINT"] = 4] = "HINT";
})(DiagnosticSeverity || (DiagnosticSeverity = {}));
//# sourceMappingURL=sysml-types.js.map