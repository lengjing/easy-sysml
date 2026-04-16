import type { LexerError } from './lexer.js';
import type { PackageNode } from '@easy-sysml/ast';
export interface ParseError {
    message: string;
    line: number;
    column: number;
    offset: number;
    length: number;
}
export interface ParseResult {
    ast: PackageNode;
    errors: ParseError[];
    lexerErrors: LexerError[];
    success: boolean;
}
export declare class SysMLParser {
    private tokens;
    private pos;
    private errors;
    parse(source: string, uri?: string): ParseResult;
    private peek;
    private advance;
    private check;
    private match;
    private expect;
    private parsePackageBody;
    private parsePackageMember;
    private parsePackageDeclaration;
    private parseImport;
    private parsePartDefOrUsage;
    private parsePartDefinition;
    private parsePartUsage;
    private parseAttributeDefOrUsage;
    private parseAttributeDefinition;
    private parseAttributeUsage;
    private parsePortDefOrUsage;
    private parsePortDefinition;
    private parsePortUsage;
    private parseDirectedPortUsage;
    private parseActionDefOrUsage;
    private parseActionDefinition;
    private parseActionUsage;
    private parseStateDefOrUsage;
    private parseStateDefinition;
    private parseStateUsage;
    private parseConnectionUsage;
    private parseAllocationUsage;
    private parseRequirementDefinition;
    private parseConstraintDefinition;
    private parseAbstractDef;
    private parseComment;
    private parseDocumentation;
    private parseDefinitionBody;
    private parseQualifiedName;
    private parseIdentifierName;
    private parseMultiplicity;
    private parseExpression;
    private parseLiteral;
    private reportError;
    private synchronize;
    private skipBody;
    private wrapInMembership;
    private lookAhead;
}
//# sourceMappingURL=parser.d.ts.map