import type { PackageNode, PartDefinitionNode, PartUsageNode, AttributeUsageNode, CommentNode } from './nodes.js';
/** Create a Package node */
export declare function createPackage(name: string): PackageNode;
/** Create a PartDefinition node */
export declare function createPartDefinition(name: string, isAbstract?: boolean): PartDefinitionNode;
/** Create a PartUsage node */
export declare function createPartUsage(name: string): PartUsageNode;
/** Create an AttributeUsage node */
export declare function createAttributeUsage(name: string): AttributeUsageNode;
/** Create a Comment node */
export declare function createComment(body: string): CommentNode;
//# sourceMappingURL=factory.d.ts.map