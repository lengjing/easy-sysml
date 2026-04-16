import type { Symbol, SymbolTable } from './symbol-table.js';
/** Type in the SysML type system */
export interface SysMLType {
    name: string;
    kind: TypeKind;
    supertypes: SysMLType[];
    features: TypeFeature[];
}
export declare enum TypeKind {
    CLASSIFIER = "classifier",
    DATA_TYPE = "dataType",
    PART = "part",
    PORT = "port",
    ACTION = "action",
    STATE = "state",
    REQUIREMENT = "requirement",
    CONSTRAINT = "constraint",
    ATTRIBUTE = "attribute"
}
export interface TypeFeature {
    name: string;
    type?: SysMLType;
    direction?: 'in' | 'out' | 'inout';
    multiplicity?: {
        lower: number;
        upper: number | '*';
    };
}
/** Type registry and checker */
export declare class TypeSystem {
    private types;
    /** Register a type */
    registerType(type: SysMLType): void;
    /** Get a type by name */
    getType(name: string): SysMLType | undefined;
    /** Check if 'sub' is a subtype of 'super' */
    isSubtype(sub: SysMLType, superType: SysMLType): boolean;
    /** Check if a usage is compatible with its definition */
    isCompatible(usage: Symbol, definition: Symbol): boolean;
    /** Get all features of a type (including inherited) */
    getAllFeatures(type: SysMLType): TypeFeature[];
    /** Register built-in types (Boolean, Integer, Real, String, etc.) */
    registerBuiltins(): void;
    /** Build types from symbol table */
    buildFromSymbols(symbolTable: SymbolTable): void;
    private isKindCompatible;
}
//# sourceMappingURL=type-system.d.ts.map