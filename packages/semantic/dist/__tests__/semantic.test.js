import { describe, it, expect } from 'vitest';
import { SemanticAnalyzer } from '../semantic-model.js';
import { SymbolTable, SymbolKind } from '../symbol-table.js';
import { Scope, ScopeBuilder } from '../scope.js';
import { TypeSystem, TypeKind } from '../type-system.js';
// Helper to create minimal AST nodes for testing
let idCounter = 0;
function makeId() {
    return `test-${++idCounter}`;
}
function makePartDefinition(name, specializations = []) {
    return {
        $type: 'PartDefinition',
        $id: makeId(),
        name,
        isAbstract: false,
        members: [],
        specializations: specializations.map((s) => ({
            $type: 'Specialization',
            $id: makeId(),
            general: s.general,
        })),
    };
}
function makePartUsage(name, typings = []) {
    return {
        $type: 'PartUsage',
        $id: makeId(),
        name,
        typings: typings.map((t) => ({
            $type: 'FeatureTyping',
            $id: makeId(),
            type: t,
        })),
        members: [],
    };
}
function makeMembership(element, memberName) {
    return {
        $type: 'Membership',
        $id: makeId(),
        visibility: 'public',
        memberName,
        memberElement: element,
    };
}
function makePackage(name, members) {
    return {
        $type: 'Package',
        $id: makeId(),
        name,
        members,
        imports: [],
    };
}
function makeRootPackage(members) {
    return {
        $type: 'Package',
        $id: makeId(),
        members,
        imports: [],
    };
}
describe('SymbolTable', () => {
    it('should store and retrieve symbols', () => {
        const table = new SymbolTable();
        const scope = new Scope('root');
        const symbol = {
            name: 'Vehicle',
            qualifiedName: 'Vehicle',
            kind: SymbolKind.DEFINITION,
            node: { $type: 'PartDefinition', $id: '1' },
            scope,
        };
        table.addSymbol(symbol);
        expect(table.getByName('Vehicle')).toHaveLength(1);
        expect(table.getByQualifiedName('Vehicle')).toBe(symbol);
    });
    it('should retrieve symbol by node', () => {
        const table = new SymbolTable();
        const scope = new Scope('root');
        const node = { $type: 'PartDefinition', $id: 'node-1' };
        const symbol = {
            name: 'Engine',
            qualifiedName: 'Engine',
            kind: SymbolKind.DEFINITION,
            node,
            scope,
        };
        table.addSymbol(symbol);
        expect(table.getForNode(node)).toBe(symbol);
    });
    it('should handle multiple symbols with the same name', () => {
        const table = new SymbolTable();
        const scope = new Scope('root');
        const sym1 = {
            name: 'Part',
            qualifiedName: 'A::Part',
            kind: SymbolKind.DEFINITION,
            node: { $type: 'PartDefinition', $id: '1' },
            scope,
        };
        const sym2 = {
            name: 'Part',
            qualifiedName: 'B::Part',
            kind: SymbolKind.DEFINITION,
            node: { $type: 'PartDefinition', $id: '2' },
            scope,
        };
        table.addSymbol(sym1);
        table.addSymbol(sym2);
        expect(table.getByName('Part')).toHaveLength(2);
        expect(table.getByQualifiedName('A::Part')).toBe(sym1);
        expect(table.getByQualifiedName('B::Part')).toBe(sym2);
    });
    it('should remove symbols', () => {
        const table = new SymbolTable();
        const scope = new Scope('root');
        const symbol = {
            name: 'Temp',
            qualifiedName: 'Temp',
            kind: SymbolKind.DEFINITION,
            node: { $type: 'PartDefinition', $id: '1' },
            scope,
        };
        table.addSymbol(symbol);
        table.removeSymbol(symbol);
        expect(table.getByName('Temp')).toHaveLength(0);
        expect(table.getByQualifiedName('Temp')).toBeUndefined();
    });
    it('should clear all symbols', () => {
        const table = new SymbolTable();
        const scope = new Scope('root');
        table.addSymbol({
            name: 'A',
            qualifiedName: 'A',
            kind: SymbolKind.DEFINITION,
            node: { $type: 'PartDefinition', $id: '1' },
            scope,
        });
        table.addSymbol({
            name: 'B',
            qualifiedName: 'B',
            kind: SymbolKind.USAGE,
            node: { $type: 'PartUsage', $id: '2' },
            scope,
        });
        table.clear();
        expect(table.getAllSymbols()).toHaveLength(0);
    });
});
describe('Scope', () => {
    it('should resolve names in parent scopes', () => {
        const root = new Scope('root');
        const child = root.createChild('child');
        const symbol = {
            name: 'Foo',
            qualifiedName: 'Foo',
            kind: SymbolKind.DEFINITION,
            node: { $type: 'PartDefinition', $id: '1' },
            scope: root,
        };
        root.define(symbol);
        expect(child.resolve('Foo')).toBe(symbol);
    });
    it('should shadow parent symbols', () => {
        const root = new Scope('root');
        const child = root.createChild('child');
        const parentSym = {
            name: 'Foo',
            qualifiedName: 'Foo',
            kind: SymbolKind.DEFINITION,
            node: { $type: 'PartDefinition', $id: '1' },
            scope: root,
        };
        const childSym = {
            name: 'Foo',
            qualifiedName: 'child::Foo',
            kind: SymbolKind.USAGE,
            node: { $type: 'PartUsage', $id: '2' },
            scope: child,
        };
        root.define(parentSym);
        child.define(childSym);
        expect(child.resolve('Foo')).toBe(childSym);
    });
    it('should compute qualified name', () => {
        const root = new Scope('Root');
        const child = root.createChild('Child');
        const grandchild = child.createChild('Grandchild');
        expect(grandchild.getQualifiedName()).toBe('Root::Child::Grandchild');
    });
    it('should return undefined for unresolved names', () => {
        const scope = new Scope('root');
        expect(scope.resolve('NonExistent')).toBeUndefined();
    });
    it('should list visible symbols', () => {
        const root = new Scope('root');
        const child = root.createChild('child');
        const sym1 = {
            name: 'A',
            qualifiedName: 'A',
            kind: SymbolKind.DEFINITION,
            node: { $type: 'PartDefinition', $id: '1' },
            scope: root,
        };
        const sym2 = {
            name: 'B',
            qualifiedName: 'child::B',
            kind: SymbolKind.USAGE,
            node: { $type: 'PartUsage', $id: '2' },
            scope: child,
        };
        root.define(sym1);
        child.define(sym2);
        const visible = child.getVisibleSymbols();
        expect(visible).toHaveLength(2);
        expect(visible.map((s) => s.name).sort()).toEqual(['A', 'B']);
    });
});
describe('ScopeBuilder', () => {
    it('should build scopes from a package AST', () => {
        const engine = makePartDefinition('Engine');
        const myEngine = makePartUsage('myEngine', ['Engine']);
        const vehiclePkg = makePackage('Vehicle', [
            makeMembership(engine),
            makeMembership(myEngine),
        ]);
        const root = makeRootPackage([makeMembership(vehiclePkg)]);
        const symbolTable = new SymbolTable();
        const builder = new ScopeBuilder(symbolTable);
        const rootScope = builder.buildScopes(root);
        // Vehicle should be defined in root scope
        expect(rootScope.resolve('Vehicle')).toBeDefined();
        expect(rootScope.resolve('Vehicle')?.kind).toBe(SymbolKind.PACKAGE);
        // Engine should be defined in Vehicle's child scope
        const vehicleScope = rootScope.getChild('Vehicle');
        expect(vehicleScope).toBeDefined();
        expect(vehicleScope?.resolve('Engine')).toBeDefined();
        expect(vehicleScope?.resolve('myEngine')).toBeDefined();
        // Symbol table should have entries
        expect(symbolTable.getByName('Vehicle')).toHaveLength(1);
        expect(symbolTable.getByName('Engine')).toHaveLength(1);
        expect(symbolTable.getByName('myEngine')).toHaveLength(1);
    });
    it('should compute qualified names', () => {
        const engine = makePartDefinition('Engine');
        const vehiclePkg = makePackage('Vehicle', [makeMembership(engine)]);
        const root = makeRootPackage([makeMembership(vehiclePkg)]);
        const symbolTable = new SymbolTable();
        const builder = new ScopeBuilder(symbolTable);
        builder.buildScopes(root);
        const engineSym = symbolTable.getByName('Engine')[0];
        expect(engineSym.qualifiedName).toBe('Vehicle::Engine');
    });
});
describe('TypeSystem', () => {
    it('should register and retrieve built-in types', () => {
        const ts = new TypeSystem();
        ts.registerBuiltins();
        expect(ts.getType('Integer')).toBeDefined();
        expect(ts.getType('String')).toBeDefined();
        expect(ts.getType('Boolean')).toBeDefined();
        expect(ts.getType('Real')).toBeDefined();
    });
    it('should check subtype relationships', () => {
        const ts = new TypeSystem();
        ts.registerBuiltins();
        const integer = ts.getType('Integer');
        const real = ts.getType('Real');
        // Integer is a subtype of Real in SysML
        expect(ts.isSubtype(integer, real)).toBe(true);
    });
    it('should report non-subtype correctly', () => {
        const ts = new TypeSystem();
        ts.registerBuiltins();
        const str = ts.getType('String');
        const real = ts.getType('Real');
        expect(ts.isSubtype(str, real)).toBe(false);
    });
    it('should get all features including inherited', () => {
        const ts = new TypeSystem();
        ts.registerBuiltins();
        const baseType = {
            name: 'Base',
            kind: TypeKind.CLASSIFIER,
            supertypes: [],
            features: [{ name: 'baseProp' }],
        };
        const childType = {
            name: 'Child',
            kind: TypeKind.CLASSIFIER,
            supertypes: [baseType],
            features: [{ name: 'childProp' }],
        };
        ts.registerType(baseType);
        ts.registerType(childType);
        const allFeatures = ts.getAllFeatures(childType);
        expect(allFeatures).toHaveLength(2);
        expect(allFeatures.map((f) => f.name).sort()).toEqual(['baseProp', 'childProp']);
    });
    it('should build types from symbol table', () => {
        const engine = makePartDefinition('Engine');
        const vehiclePkg = makePackage('Vehicle', [makeMembership(engine)]);
        const root = makeRootPackage([makeMembership(vehiclePkg)]);
        const symbolTable = new SymbolTable();
        const builder = new ScopeBuilder(symbolTable);
        builder.buildScopes(root);
        const ts = new TypeSystem();
        ts.registerBuiltins();
        ts.buildFromSymbols(symbolTable);
        expect(ts.getType('Engine')).toBeDefined();
        expect(ts.getType('Vehicle')).toBeDefined();
    });
});
describe('SemanticAnalyzer', () => {
    it('should analyze a simple model', () => {
        const engine = makePartDefinition('Engine');
        const myEngine = makePartUsage('myEngine', ['Engine']);
        const vehiclePkg = makePackage('Vehicle', [
            makeMembership(engine),
            makeMembership(myEngine),
        ]);
        const root = makeRootPackage([makeMembership(vehiclePkg)]);
        const analyzer = new SemanticAnalyzer();
        const result = analyzer.analyze(root);
        expect(result.symbolTable.getAllSymbols().length).toBeGreaterThan(0);
        expect(result.rootScope).toBeDefined();
        expect(result.typeSystem.getType('Engine')).toBeDefined();
    });
    it('should resolve type references', () => {
        const engine = makePartDefinition('Engine');
        const myEngine = makePartUsage('myEngine', ['Engine']);
        const vehiclePkg = makePackage('Vehicle', [
            makeMembership(engine),
            makeMembership(myEngine),
        ]);
        const root = makeRootPackage([makeMembership(vehiclePkg)]);
        const analyzer = new SemanticAnalyzer();
        const result = analyzer.analyze(root);
        // myEngine : Engine should resolve to the Engine definition
        const typingRefs = result.resolvedReferences.filter((r) => r.referenceName === 'Engine');
        expect(typingRefs.length).toBeGreaterThan(0);
    });
    it('should report unresolved references', () => {
        const myEngine = makePartUsage('myEngine', ['NonExistentType']);
        const vehiclePkg = makePackage('Vehicle', [
            makeMembership(myEngine),
        ]);
        const root = makeRootPackage([makeMembership(vehiclePkg)]);
        const analyzer = new SemanticAnalyzer();
        const result = analyzer.analyze(root);
        expect(result.unresolvedReferences.length).toBeGreaterThan(0);
        expect(result.errors.length).toBeGreaterThan(0);
        expect(result.errors[0].message).toContain('NonExistentType');
    });
    it('should handle specialization relationships', () => {
        const vehicle = makePartDefinition('Vehicle');
        const car = makePartDefinition('Car', [{ general: 'Vehicle' }]);
        const root = makeRootPackage([
            makeMembership(vehicle),
            makeMembership(car),
        ]);
        const analyzer = new SemanticAnalyzer();
        const result = analyzer.analyze(root);
        const specRefs = result.resolvedReferences.filter((r) => r.referenceName === 'Vehicle');
        expect(specRefs.length).toBeGreaterThan(0);
    });
});
//# sourceMappingURL=semantic.test.js.map