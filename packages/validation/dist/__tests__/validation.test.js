import { describe, it, expect } from 'vitest';
import { ValidationEngine } from '../engine.js';
import { ValidationRegistry } from '../registry.js';
import { sysmlCorePlugin } from '../plugins/sysml-core-plugin.js';
import { DiagnosticSeverity } from '@easy-sysml/protocol';
import { SymbolTable, Scope, TypeSystem } from '@easy-sysml/semantic';
import { createPackage, createPartDefinition } from '@easy-sysml/ast';
// Helper to create minimal semantic result
function createMinimalSemantics() {
    return {
        symbolTable: new SymbolTable(),
        rootScope: new Scope('root'),
        typeSystem: new TypeSystem(),
        resolvedReferences: [],
        unresolvedReferences: [],
        errors: [],
    };
}
describe('ValidationRegistry', () => {
    it('should register and retrieve rules', () => {
        const registry = new ValidationRegistry();
        registry.registerPlugin(sysmlCorePlugin);
        expect(registry.getActiveRules().length).toBeGreaterThan(0);
    });
    it('should disable/enable rules', () => {
        const registry = new ValidationRegistry();
        registry.registerPlugin(sysmlCorePlugin);
        const allRules = registry.getActiveRules().length;
        registry.disableRule('sysml.naming.definition-uppercase');
        expect(registry.getActiveRules().length).toBe(allRules - 1);
        registry.enableRule('sysml.naming.definition-uppercase');
        expect(registry.getActiveRules().length).toBe(allRules);
    });
});
describe('ValidationEngine', () => {
    it('should validate a model', () => {
        const registry = new ValidationRegistry();
        registry.registerPlugin(sysmlCorePlugin);
        const engine = new ValidationEngine(registry);
        const pkg = createPackage('TestPkg');
        const semantics = createMinimalSemantics();
        const result = engine.validate(pkg, semantics);
        expect(result.rulesApplied).toBeGreaterThan(0);
    });
    it('should detect naming violations', () => {
        const registry = new ValidationRegistry();
        registry.registerPlugin(sysmlCorePlugin);
        const engine = new ValidationEngine(registry);
        const pkg = createPackage('TestPkg');
        const badDef = createPartDefinition('myBadName'); // lowercase = warning
        pkg.members.push({
            $type: 'Membership',
            $id: 'mem-1',
            memberElement: badDef,
        });
        const semantics = createMinimalSemantics();
        const result = engine.validate(pkg, semantics);
        const namingWarnings = result.diagnostics.filter(d => d.code === 'sysml.naming.definition-uppercase');
        expect(namingWarnings.length).toBe(1);
        expect(namingWarnings[0].severity).toBe(DiagnosticSeverity.WARNING);
    });
});
//# sourceMappingURL=validation.test.js.map