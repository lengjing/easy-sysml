standard library package StandardViewDefinitions {
    doc /*
         * This package defines the standard view definitions for the SysML language.
         */
    public import SysML::*;

    // =========================================================================
    // Basic Views (基础视图)
    // =========================================================================

    view def <gv> GeneralView {
        doc /*
             * View definition to present any members of exposed model element(s).
             * This is the most general view, enabling presentation of any model element.
             * The typical rendering in graphical notation is as a graph of nodes and edges.
             * Specializations of GeneralView can be specified through appropriate selection of filters, e.g.:
             * - package view, filtering on Package, Package containment, package Import
             * - definition and usage view, filtering on Definition, Usage, Specialization, FeatureTyping (covering defined by)
             * - requirement view, filtering on RequirementDefinition, RequirementUsage, Specialization, FeatureTyping, 
             *   SatisfyRequirementUsage, AllocationDefinition, AllocationUsage,
             * - view and viewpoint view, filtering on ViewDefinition, ViewUsage, ViewpointDefinition, ViewpointUsage, 
             *   RenderingDefinition, RenderingUsage, ConcernDefinition, ConcernUsage, StakeholderMembership, ...
             * - language extension view, filtering on Metaclass, MetadataFeature, MetadataAccessExpression, ...
             * Note: filters are specified by referencing concepts from the KerML.kerml and SysML.sysml standard library packages.
             */
    }

    view def <pkv> PackageView specializes GeneralView {
        doc /*
             * View definition (包视图) to present the package structure of the model.
             * Presents packages, their containment relationships, and package imports.
             * Valid nodes and edges in a PackageView are:
             * - Packages and namespaces
             * - Package containment (membership) edges
             * - Package import edges (public and private)
             * - Package merge edges
             * Filters on Package, Namespace, Import, PackageMerge.
             */
    }

    view def <rv> RequirementView specializes GeneralView {
        doc /*
             * View definition (需求视图) to present requirements and their relationships.
             * Presents requirement definitions, requirement usages, and requirement satisfaction.
             * Valid nodes and edges in a RequirementView are:
             * - RequirementDefinition and RequirementUsage nodes
             * - Specialization and FeatureTyping edges (defined by)
             * - SatisfyRequirementUsage edges (satisfy)
             * - AllocationDefinition and AllocationUsage nodes and edges
             * - Derivation relationships
             * Filters on RequirementDefinition, RequirementUsage, SatisfyRequirementUsage,
             * AllocationDefinition, AllocationUsage, and related connectors.
             */
    }

    view def <duv> DefinitionUsageView specializes GeneralView {
        doc /*
             * View definition (定义和使用视图) to present definitions and their usages.
             * Presents the relationship between definitions (types) and their usages (features).
             * Valid nodes and edges in a DefinitionUsageView are:
             * - Definition nodes (PartDefinition, ActionDefinition, StateDefinition, etc.)
             * - Usage nodes (PartUsage, ActionUsage, StateUsage, etc.)
             * - FeatureTyping edges (typed by / defined by)
             * - Specialization edges (specializes)
             * - Subsetting and redefinition edges
             * Filters on Definition, Usage, Specialization, FeatureTyping, Subsetting, Redefinition.
             */
    }

    view def <iv> InterconnectionView {
        doc /*
             * View definition to present exposed features as nodes, nested features as
             * nested nodes, and connections between features
             * as edges between (nested) nodes. Nested nodes may present boundary features
             * (e.g., ports, parameters).
             */
    }

    view def <afv> ActionFlowView specializes InterconnectionView {
        doc /*
             * View definition (动作流视图) to present connections between actions.
             * Valid nodes and edges in an ActionFlowView are:
             * - Actions with nested actions
             * - Parameters with direction
             * - Flow connection usages (e.g., kinds of transfers from output to input)
             * - Binding connections between parameters (e.g., delegate a parameter from
             *   one level of nesting to another)
             * - Proxy connection points
             * - Swim lanes
             * - Conditional succession
             * - Control nodes (fork, join, decision, merge)
             * - Control structures, e.g., if-then-else, until-while-loop, for-loop
             * - Send and accept actions
             * - Change and time triggers
             * - Compartments on actions and parameters
             */
    }

    view def <stv> StateTransitionView specializes InterconnectionView {
        doc /*
             * View definition (状态转换视图) to present states and their transitions.
             * Valid nodes and edges in a StateTransitionView are:
             * - States with nested states
             * - Entry, do, and exit actions
             * - Transition usages with triggers, guards, and actions
             * - Compartments on states
             */
    }

    view def <lev> LanguageExtensionView specializes GeneralView {
        doc /*
             * View definition (语言扩展视图) to present SysML v2 language extensions.
             * Presents metaclasses, metadata features, and metadata access expressions.
             * Valid nodes and edges in a LanguageExtensionView are:
             * - Metaclass definitions
             * - MetadataFeature usages and MetadataAccessExpression
             * - MetadataDefinition and MetadataUsage nodes
             * - Annotation relationships
             * Filters on Metaclass, MetadataFeature, MetadataAccessExpression,
             * MetadataDefinition, MetadataUsage from KerML and SysML packages.
             */
    }

    view def <sv> SequenceView {
        doc /*
             * View definition to present time ordering of event occurrences on lifelines
             * of exposed features.
             * Valid nodes and edges in a SequenceView are:
             * - Features such as parts with their lifelines
             * - Event occurrences on the lifelines
             * - Messages sent from one part to another with and without a type of flow
             * - Succession between event occurrences
             * - Nested sequence view (e.g., a reference to a view)
             * - Compartments
             * The typical rendering in graphical notation depicts the exposed features
             * horizontally along the top, with vertical lifelines. The time axis is
             * vertical, with time increasing from top to bottom.
             */
    }

    view def <gev> GeometryView {
        doc /*
             * View definition to present a visualization of exposed spatial items in two
             * or three dimensions
             * Valid nodes and edges in a GeometryView are:
             * - Spatial item, including shape
             * - Coordinate frame
             * - Feature related to spatial item, such as a quantity (e.g. temperature)
             *   of which values are to be rendered on a color scale
             * The typical rendering in graphical notation would include a number of
             * visualization parameters, such as:
             * - 2D or 3D view
             * - viewing direction
             * - zoom level
             * - light sources
             * - object projection mode, e.g., isometric, perspective, orthographic
             * - object rendering mode, e.g., shaded, wireframe, hidden line
             * - object pan (placement) and rotate (orientation) settings
             * - color maps
             */
    }

    view def <grv> GridView {
        doc /*
             * View definition to present exposed model elements and their relationships,
             * arranged in a rectangular grid.
             * GridView is the generalization of the following more specialized views:
             * - Tabular view (通用表)
             * - Data value tabular view
             * - Relationship matrix view (关系矩阵), e.g. presenting allocation or dependency relationships
             */
    }

    view def <bv> BrowserView {
        doc /*
             * View definition to present the hierarchical membership structure of model
             * elements starting from one or more exposed root elements.
             * The typical rendering in graphical notation is as an indented list of rows,
             * consisting of dynamically collapsible-expandable nodes that represent
             * branches and leaves of the tree, as in graphical user interface widgets.
             */
    }

    // =========================================================================
    // Table Views (表格视图)
    // =========================================================================

    view def <tv> GeneralTable specializes GridView {
        doc /*
             * View definition (通用表) to present exposed model elements and their
             * properties in a tabular (row-column) format.
             * Each row represents an element, each column represents a property or
             * relationship. Supports filtering, sorting, and custom column selection.
             * Typical use: listing requirements, parts, actions, or any element type
             * with their attributes in a spreadsheet-like grid.
             */
    }

    // =========================================================================
    // Matrix Views (矩阵视图)
    // =========================================================================

    view def <rmv> RelationshipMatrix specializes GridView {
        doc /*
             * View definition (关系矩阵) to present relationships between two sets of
             * model elements in a matrix format.
             * Rows represent one set of elements (e.g., requirements), columns represent
             * another set (e.g., components). Matrix cells indicate the presence,
             * type, or value of a relationship between the row element and column element.
             * Typical uses:
             * - Allocation matrix: requirements to components
             * - Dependency matrix: functions to systems
             * - Traceability matrix: requirements to test cases
             */
    }

    // =========================================================================
    // Traceability Views (追溯视图)
    // =========================================================================

    view def <trv> TraceabilityView specializes GeneralView {
        doc /*
             * View definition (追溯图) to present traceability relationships between
             * model elements across different abstraction levels or domains.
             * Presents end-to-end traceability chains linking requirements, design
             * elements, verification cases, and other artifacts.
             * Valid nodes and edges in a TraceabilityView are:
             * - Any model element that participates in a traceability relationship
             * - Derivation relationships (RequirementDerivation)
             * - Satisfaction relationships (SatisfyRequirementUsage)
             * - Verification relationships (VerificationCase to Requirement)
             * - Allocation relationships
             * - Dependency relationships (general)
             */
    }
}
