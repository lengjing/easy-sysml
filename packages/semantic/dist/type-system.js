import { SymbolKind } from './symbol-table.js';
export var TypeKind;
(function (TypeKind) {
    TypeKind["CLASSIFIER"] = "classifier";
    TypeKind["DATA_TYPE"] = "dataType";
    TypeKind["PART"] = "part";
    TypeKind["PORT"] = "port";
    TypeKind["ACTION"] = "action";
    TypeKind["STATE"] = "state";
    TypeKind["REQUIREMENT"] = "requirement";
    TypeKind["CONSTRAINT"] = "constraint";
    TypeKind["ATTRIBUTE"] = "attribute";
})(TypeKind || (TypeKind = {}));
/** Map AST $type to TypeKind */
function typeKindFromNodeType(nodeType) {
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
    types = new Map();
    /** Register a type */
    registerType(type) {
        this.types.set(type.name, type);
    }
    /** Get a type by name */
    getType(name) {
        return this.types.get(name);
    }
    /** Check if 'sub' is a subtype of 'super' */
    isSubtype(sub, superType) {
        if (sub === superType)
            return true;
        if (sub.name === superType.name)
            return true;
        // Check direct supertypes
        for (const parent of sub.supertypes) {
            if (this.isSubtype(parent, superType))
                return true;
        }
        return false;
    }
    /** Check if a usage is compatible with its definition */
    isCompatible(usage, definition) {
        const usageType = this.types.get(usage.name);
        const defType = this.types.get(definition.name);
        if (!usageType || !defType)
            return true; // cannot determine, assume ok
        // Check kind compatibility
        if (usageType.kind !== defType.kind) {
            // Some cross-kind compatibility is allowed
            return this.isKindCompatible(usageType.kind, defType.kind);
        }
        return true;
    }
    /** Get all features of a type (including inherited) */
    getAllFeatures(type) {
        const features = new Map();
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
    registerBuiltins() {
        const anyType = {
            name: 'Anything',
            kind: TypeKind.CLASSIFIER,
            supertypes: [],
            features: [],
        };
        this.registerType(anyType);
        const booleanType = {
            name: 'Boolean',
            kind: TypeKind.DATA_TYPE,
            supertypes: [anyType],
            features: [],
        };
        this.registerType(booleanType);
        const realType = {
            name: 'Real',
            kind: TypeKind.DATA_TYPE,
            supertypes: [anyType],
            features: [],
        };
        this.registerType(realType);
        const integerType = {
            name: 'Integer',
            kind: TypeKind.DATA_TYPE,
            supertypes: [realType], // Integer is a subtype of Real in SysML
            features: [],
        };
        this.registerType(integerType);
        const naturalType = {
            name: 'Natural',
            kind: TypeKind.DATA_TYPE,
            supertypes: [integerType],
            features: [],
        };
        this.registerType(naturalType);
        const stringType = {
            name: 'String',
            kind: TypeKind.DATA_TYPE,
            supertypes: [anyType],
            features: [],
        };
        this.registerType(stringType);
    }
    /** Build types from symbol table */
    buildFromSymbols(symbolTable) {
        const allSymbols = symbolTable.getAllSymbols();
        // First pass: create all types from definitions
        for (const sym of allSymbols) {
            if (sym.kind === SymbolKind.DEFINITION || sym.kind === SymbolKind.PACKAGE) {
                if (this.types.has(sym.name))
                    continue; // don't overwrite built-ins
                const type = {
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
            if (sym.kind !== SymbolKind.DEFINITION)
                continue;
            const type = this.types.get(sym.name);
            if (!type)
                continue;
            const specializations = sym.node.specializations;
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
            if (sym.kind !== SymbolKind.DEFINITION)
                continue;
            const type = this.types.get(sym.name);
            if (!type)
                continue;
            const members = sym.node.members;
            if (members) {
                for (const member of members) {
                    const memberElement = member.memberElement;
                    if (!memberElement)
                        continue;
                    const memberName = memberElement.name ?? member.memberName;
                    if (!memberName)
                        continue;
                    const feature = { name: memberName };
                    // Resolve typing
                    const typings = memberElement.typings;
                    if (typings && typings.length > 0 && typings[0].type) {
                        feature.type = this.types.get(typings[0].type);
                    }
                    // Resolve direction
                    const direction = memberElement.direction;
                    if (direction) {
                        feature.direction = direction;
                    }
                    // Resolve multiplicity
                    const multiplicity = memberElement.multiplicity;
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
    isKindCompatible(usageKind, defKind) {
        // Classifier is compatible with everything
        if (defKind === TypeKind.CLASSIFIER)
            return true;
        // Attribute is compatible with DataType
        if (usageKind === TypeKind.ATTRIBUTE && defKind === TypeKind.DATA_TYPE)
            return true;
        return usageKind === defKind;
    }
}
//# sourceMappingURL=type-system.js.map