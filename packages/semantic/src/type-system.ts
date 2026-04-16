import type { Symbol, SymbolTable } from './symbol-table.js';
import { SymbolKind } from './symbol-table.js';
import type { AstNode } from '@easy-sysml/ast';

/** Type in the SysML type system */
export interface SysMLType {
  name: string;
  kind: TypeKind;
  supertypes: SysMLType[];
  features: TypeFeature[];
}

export enum TypeKind {
  CLASSIFIER = 'classifier',
  DATA_TYPE = 'dataType',
  PART = 'part',
  PORT = 'port',
  ACTION = 'action',
  STATE = 'state',
  REQUIREMENT = 'requirement',
  CONSTRAINT = 'constraint',
  ATTRIBUTE = 'attribute',
}

export interface TypeFeature {
  name: string;
  type?: SysMLType;
  direction?: 'in' | 'out' | 'inout';
  multiplicity?: { lower: number; upper: number | '*' };
}

/** Map AST $type to TypeKind */
function typeKindFromNodeType(nodeType: string): TypeKind {
  switch (nodeType) {
    case 'PartDefinition':
    case 'PartUsage':
      return TypeKind.PART;
    case 'PortDefinition':
    case 'PortUsage':
      return TypeKind.PORT;
    case 'ActionDefinition':
    case 'ActionUsage':
      return TypeKind.ACTION;
    case 'StateDefinition':
    case 'StateUsage':
      return TypeKind.STATE;
    case 'RequirementDefinition':
      return TypeKind.REQUIREMENT;
    case 'ConstraintDefinition':
      return TypeKind.CONSTRAINT;
    case 'AttributeDefinition':
    case 'AttributeUsage':
      return TypeKind.ATTRIBUTE;
    default:
      return TypeKind.CLASSIFIER;
  }
}

/** Type registry and checker */
export class TypeSystem {
  private types = new Map<string, SysMLType>();

  /** Register a type */
  registerType(type: SysMLType): void {
    this.types.set(type.name, type);
  }

  /** Get a type by name */
  getType(name: string): SysMLType | undefined {
    return this.types.get(name);
  }

  /** Check if 'sub' is a subtype of 'super' */
  isSubtype(sub: SysMLType, superType: SysMLType): boolean {
    if (sub === superType) return true;
    if (sub.name === superType.name) return true;

    // Check direct supertypes
    for (const parent of sub.supertypes) {
      if (this.isSubtype(parent, superType)) return true;
    }

    return false;
  }

  /** Check if a usage is compatible with its definition */
  isCompatible(usage: Symbol, definition: Symbol): boolean {
    const usageType = this.types.get(usage.name);
    const defType = this.types.get(definition.name);

    if (!usageType || !defType) return true; // cannot determine, assume ok

    // Check kind compatibility
    if (usageType.kind !== defType.kind) {
      // Some cross-kind compatibility is allowed
      return this.isKindCompatible(usageType.kind, defType.kind);
    }

    return true;
  }

  /** Get all features of a type (including inherited) */
  getAllFeatures(type: SysMLType): TypeFeature[] {
    const features = new Map<string, TypeFeature>();

    // Collect inherited features first (can be overridden)
    for (const superType of type.supertypes) {
      for (const feature of this.getAllFeatures(superType)) {
        features.set(feature.name, feature);
      }
    }

    // Own features override inherited
    for (const feature of type.features) {
      features.set(feature.name, feature);
    }

    return Array.from(features.values());
  }

  /** Register built-in types (Boolean, Integer, Real, String, etc.) */
  registerBuiltins(): void {
    const anyType: SysMLType = {
      name: 'Anything',
      kind: TypeKind.CLASSIFIER,
      supertypes: [],
      features: [],
    };
    this.registerType(anyType);

    const booleanType: SysMLType = {
      name: 'Boolean',
      kind: TypeKind.DATA_TYPE,
      supertypes: [anyType],
      features: [],
    };
    this.registerType(booleanType);

    const realType: SysMLType = {
      name: 'Real',
      kind: TypeKind.DATA_TYPE,
      supertypes: [anyType],
      features: [],
    };
    this.registerType(realType);

    const integerType: SysMLType = {
      name: 'Integer',
      kind: TypeKind.DATA_TYPE,
      supertypes: [realType], // Integer is a subtype of Real in SysML
      features: [],
    };
    this.registerType(integerType);

    const naturalType: SysMLType = {
      name: 'Natural',
      kind: TypeKind.DATA_TYPE,
      supertypes: [integerType],
      features: [],
    };
    this.registerType(naturalType);

    const stringType: SysMLType = {
      name: 'String',
      kind: TypeKind.DATA_TYPE,
      supertypes: [anyType],
      features: [],
    };
    this.registerType(stringType);
  }

  /** Build types from symbol table */
  buildFromSymbols(symbolTable: SymbolTable): void {
    const allSymbols = symbolTable.getAllSymbols();

    // First pass: create all types from definitions
    for (const sym of allSymbols) {
      if (sym.kind === SymbolKind.DEFINITION || sym.kind === SymbolKind.PACKAGE) {
        if (this.types.has(sym.name)) continue; // don't overwrite built-ins

        const type: SysMLType = {
          name: sym.name,
          kind: typeKindFromNodeType(sym.node.$type),
          supertypes: [],
          features: [],
        };
        this.registerType(type);
      }
    }

    // Second pass: resolve specialization (supertype) relationships
    for (const sym of allSymbols) {
      if (sym.kind !== SymbolKind.DEFINITION) continue;

      const type = this.types.get(sym.name);
      if (!type) continue;

      const specializations = (sym.node as unknown as Record<string, unknown>).specializations as
        | Array<{ general?: string }>
        | undefined;

      if (specializations) {
        for (const spec of specializations) {
          if (spec.general) {
            const superType = this.types.get(spec.general);
            if (superType) {
              type.supertypes.push(superType);
            }
          }
        }
      }
    }

    // Third pass: collect features from definition members
    for (const sym of allSymbols) {
      if (sym.kind !== SymbolKind.DEFINITION) continue;

      const type = this.types.get(sym.name);
      if (!type) continue;

      const members = (sym.node as unknown as Record<string, unknown>).members as
        | Array<Record<string, unknown>>
        | undefined;

      if (members) {
        for (const member of members) {
          const memberElement = member.memberElement as Record<string, unknown> | undefined;
          if (!memberElement) continue;

          const memberName = (memberElement.name as string | undefined) ?? member.memberName as string | undefined;
          if (!memberName) continue;

          const feature: TypeFeature = { name: memberName };

          // Resolve typing
          const typings = memberElement.typings as Array<{ type?: string }> | undefined;
          if (typings && typings.length > 0 && typings[0].type) {
            feature.type = this.types.get(typings[0].type);
          }

          // Resolve direction
          const direction = memberElement.direction as 'in' | 'out' | 'inout' | undefined;
          if (direction) {
            feature.direction = direction;
          }

          // Resolve multiplicity
          const multiplicity = memberElement.multiplicity as { lower?: number; upper?: number | '*' } | undefined;
          if (multiplicity) {
            feature.multiplicity = {
              lower: multiplicity.lower ?? 0,
              upper: multiplicity.upper ?? '*',
            };
          }

          type.features.push(feature);
        }
      }
    }
  }

  private isKindCompatible(usageKind: TypeKind, defKind: TypeKind): boolean {
    // Classifier is compatible with everything
    if (defKind === TypeKind.CLASSIFIER) return true;
    // Attribute is compatible with DataType
    if (usageKind === TypeKind.ATTRIBUTE && defKind === TypeKind.DATA_TYPE) return true;
    return usageKind === defKind;
  }
}
