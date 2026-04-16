import type { UUID, Range } from '@easy-sysml/protocol';
/** Base AST node interface */
export interface AstNode {
    readonly $type: string;
    readonly $id: UUID;
    $container?: AstNode;
    $containerProperty?: string;
    $document?: {
        uri: string;
    };
    $range?: Range;
}
/** Namespace element - base for all named elements */
export interface NamespaceNode extends AstNode {
    $type: 'Namespace';
    name?: string;
    members: MembershipNode[];
}
/** Package node */
export interface PackageNode extends AstNode {
    $type: 'Package';
    name?: string;
    members: MembershipNode[];
    imports: ImportNode[];
}
/** Membership node */
export interface MembershipNode extends AstNode {
    $type: 'Membership';
    visibility?: 'public' | 'private' | 'protected';
    memberName?: string;
    memberElement?: AstNode;
}
/** Import node */
export interface ImportNode extends AstNode {
    $type: 'Import';
    visibility?: 'public' | 'private';
    importedNamespace?: string;
    isRecursive: boolean;
    isAll: boolean;
}
/** Type node - base for all typed elements */
export interface TypeNode extends AstNode {
    $type: 'Type';
    name?: string;
    isAbstract: boolean;
    members: MembershipNode[];
    specializations: SpecializationNode[];
    multiplicity?: MultiplicityNode;
}
/** Feature node */
export interface FeatureNode extends AstNode {
    $type: 'Feature';
    name?: string;
    direction?: 'in' | 'out' | 'inout';
    isReadonly: boolean;
    isComposite: boolean;
    typings: FeatureTypingNode[];
    value?: ExpressionNode;
    multiplicity?: MultiplicityNode;
}
/** Specialization relationship */
export interface SpecializationNode extends AstNode {
    $type: 'Specialization';
    general?: string;
}
/** Feature typing relationship */
export interface FeatureTypingNode extends AstNode {
    $type: 'FeatureTyping';
    type?: string;
}
/** Multiplicity node */
export interface MultiplicityNode extends AstNode {
    $type: 'Multiplicity';
    lower?: number;
    upper?: number | '*';
}
/** Part definition */
export interface PartDefinitionNode extends AstNode {
    $type: 'PartDefinition';
    name?: string;
    isAbstract: boolean;
    members: MembershipNode[];
    specializations: SpecializationNode[];
}
/** Attribute definition */
export interface AttributeDefinitionNode extends AstNode {
    $type: 'AttributeDefinition';
    name?: string;
    isAbstract: boolean;
    members: MembershipNode[];
}
/** Port definition */
export interface PortDefinitionNode extends AstNode {
    $type: 'PortDefinition';
    name?: string;
    isAbstract: boolean;
    members: MembershipNode[];
}
/** Action definition */
export interface ActionDefinitionNode extends AstNode {
    $type: 'ActionDefinition';
    name?: string;
    isAbstract: boolean;
    members: MembershipNode[];
}
/** State definition */
export interface StateDefinitionNode extends AstNode {
    $type: 'StateDefinition';
    name?: string;
    isAbstract: boolean;
    members: MembershipNode[];
}
/** Requirement definition */
export interface RequirementDefinitionNode extends AstNode {
    $type: 'RequirementDefinition';
    name?: string;
    members: MembershipNode[];
    text?: string;
}
/** Constraint definition */
export interface ConstraintDefinitionNode extends AstNode {
    $type: 'ConstraintDefinition';
    name?: string;
    members: MembershipNode[];
}
/** Part usage */
export interface PartUsageNode extends AstNode {
    $type: 'PartUsage';
    name?: string;
    typings: FeatureTypingNode[];
    multiplicity?: MultiplicityNode;
    members: MembershipNode[];
}
/** Attribute usage */
export interface AttributeUsageNode extends AstNode {
    $type: 'AttributeUsage';
    name?: string;
    typings: FeatureTypingNode[];
    value?: ExpressionNode;
}
/** Port usage */
export interface PortUsageNode extends AstNode {
    $type: 'PortUsage';
    name?: string;
    direction?: 'in' | 'out' | 'inout';
    typings: FeatureTypingNode[];
}
/** Action usage */
export interface ActionUsageNode extends AstNode {
    $type: 'ActionUsage';
    name?: string;
    typings: FeatureTypingNode[];
    members: MembershipNode[];
}
/** State usage */
export interface StateUsageNode extends AstNode {
    $type: 'StateUsage';
    name?: string;
    typings: FeatureTypingNode[];
    members: MembershipNode[];
}
/** Connection usage */
export interface ConnectionUsageNode extends AstNode {
    $type: 'ConnectionUsage';
    name?: string;
    ends: FeatureNode[];
}
/** Allocation usage */
export interface AllocationUsageNode extends AstNode {
    $type: 'AllocationUsage';
    name?: string;
    source?: string;
    target?: string;
}
/** Base expression */
export interface ExpressionNode extends AstNode {
    $type: 'Expression';
}
/** Literal integer */
export interface LiteralIntegerNode extends AstNode {
    $type: 'LiteralInteger';
    value: number;
}
/** Literal real */
export interface LiteralRealNode extends AstNode {
    $type: 'LiteralReal';
    value: number;
}
/** Literal string */
export interface LiteralStringNode extends AstNode {
    $type: 'LiteralString';
    value: string;
}
/** Literal boolean */
export interface LiteralBooleanNode extends AstNode {
    $type: 'LiteralBoolean';
    value: boolean;
}
/** Comment node */
export interface CommentNode extends AstNode {
    $type: 'Comment';
    body: string;
    about?: string[];
}
/** Documentation node */
export interface DocumentationNode extends AstNode {
    $type: 'Documentation';
    body: string;
}
/** Union type for all AST nodes */
export type SysMLAstNode = NamespaceNode | PackageNode | MembershipNode | ImportNode | TypeNode | FeatureNode | SpecializationNode | FeatureTypingNode | MultiplicityNode | PartDefinitionNode | AttributeDefinitionNode | PortDefinitionNode | ActionDefinitionNode | StateDefinitionNode | RequirementDefinitionNode | ConstraintDefinitionNode | PartUsageNode | AttributeUsageNode | PortUsageNode | ActionUsageNode | StateUsageNode | ConnectionUsageNode | AllocationUsageNode | ExpressionNode | LiteralIntegerNode | LiteralRealNode | LiteralStringNode | LiteralBooleanNode | CommentNode | DocumentationNode;
//# sourceMappingURL=nodes.d.ts.map