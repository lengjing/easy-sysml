import { SymbolKind } from './symbol-table.js';
/** A scope represents a naming context */
export class Scope {
    name;
    parent;
    children = new Map();
    localSymbols = new Map();
    imports = [];
    constructor(name, parent) {
        this.name = name;
        this.parent = parent;
    }
    /** Define a symbol in this scope */
    define(symbol) {
        this.localSymbols.set(symbol.name, symbol);
    }
    /** Resolve a name in this scope (including parent scopes) */
    resolve(name) {
        // Check local symbols first
        const local = this.localSymbols.get(name);
        if (local)
            return local;
        // Check imported symbols
        for (const imp of this.imports) {
            const resolved = this.resolveImport(name, imp);
            if (resolved)
                return resolved;
        }
        // Check parent scope
        if (this.parent) {
            return this.parent.resolve(name);
        }
        return undefined;
    }
    /** Resolve a qualified name (e.g., 'Package::SubPackage::Element') */
    resolveQualified(qualifiedName) {
        const parts = qualifiedName.split('::');
        if (parts.length === 0)
            return undefined;
        if (parts.length === 1)
            return this.resolve(parts[0]);
        // Resolve the first part in the current scope chain
        const firstSymbol = this.resolve(parts[0]);
        if (!firstSymbol)
            return undefined;
        // Walk through the child scopes for subsequent parts
        let currentScope = firstSymbol.scope;
        // The first symbol's children are in a child scope named after it
        const childScope = currentScope.getChild(firstSymbol.name);
        if (!childScope && parts.length > 1)
            return undefined;
        currentScope = childScope ?? currentScope;
        for (let i = 1; i < parts.length; i++) {
            const sym = currentScope.localSymbols.get(parts[i]);
            if (!sym)
                return undefined;
            if (i < parts.length - 1) {
                const next = currentScope.getChild(parts[i]);
                if (!next)
                    return undefined;
                currentScope = next;
            }
            else {
                return sym;
            }
        }
        return undefined;
    }
    /** Get all visible symbols in this scope */
    getVisibleSymbols() {
        const visible = new Map();
        // Collect parent symbols first (can be overridden)
        if (this.parent) {
            for (const sym of this.parent.getVisibleSymbols()) {
                visible.set(sym.name, sym);
            }
        }
        // Collect imported symbols
        for (const imp of this.imports) {
            const imported = this.getImportedSymbols(imp);
            for (const sym of imported) {
                visible.set(sym.name, sym);
            }
        }
        // Local symbols override everything
        for (const [name, sym] of this.localSymbols) {
            visible.set(name, sym);
        }
        return Array.from(visible.values());
    }
    /** Create a child scope */
    createChild(name) {
        const child = new Scope(name, this);
        this.children.set(name, child);
        return child;
    }
    /** Get a child scope by name */
    getChild(name) {
        return this.children.get(name);
    }
    /** Add an import directive */
    addImport(importDirective) {
        this.imports.push(importDirective);
    }
    /** Get the qualified name of this scope */
    getQualifiedName() {
        if (this.parent && this.parent.name !== '') {
            const parentQN = this.parent.getQualifiedName();
            return parentQN ? `${parentQN}::${this.name}` : this.name;
        }
        return this.name;
    }
    resolveImport(name, imp) {
        if (imp.isAll) {
            // Wildcard import: look for `name` inside the imported namespace
            const qn = imp.namespacePath ? `${imp.namespacePath}::${name}` : name;
            // Walk up to the root scope to resolve the fully qualified name
            const root = this.getRoot();
            return root.resolveQualified(qn);
        }
        else {
            // Specific import: the last segment of the namespace path must match
            const segments = imp.namespacePath.split('::');
            const importedName = segments[segments.length - 1];
            if (importedName === name) {
                const root = this.getRoot();
                return root.resolveQualified(imp.namespacePath);
            }
        }
        return undefined;
    }
    getImportedSymbols(imp) {
        if (!imp.isAll) {
            const root = this.getRoot();
            const sym = root.resolveQualified(imp.namespacePath);
            return sym ? [sym] : [];
        }
        // For wildcard imports, return all symbols in the target namespace scope
        const root = this.getRoot();
        const targetSym = root.resolveQualified(imp.namespacePath);
        if (!targetSym)
            return [];
        const targetScope = root.findScopeForSymbol(targetSym);
        if (!targetScope)
            return [];
        return Array.from(targetScope.localSymbols.values());
    }
    getRoot() {
        let current = this;
        while (current.parent) {
            current = current.parent;
        }
        return current;
    }
    findScopeForSymbol(symbol) {
        // The scope is the child scope named after the symbol
        return this.children.get(symbol.name);
    }
}
// Helper to determine SymbolKind from AST $type
function getSymbolKind(type) {
    switch (type) {
        case 'Package':
            return SymbolKind.PACKAGE;
        case 'Namespace':
            return SymbolKind.NAMESPACE;
        case 'PartDefinition':
        case 'AttributeDefinition':
        case 'PortDefinition':
        case 'ActionDefinition':
        case 'StateDefinition':
        case 'RequirementDefinition':
        case 'ConstraintDefinition':
            return SymbolKind.DEFINITION;
        case 'PartUsage':
        case 'AttributeUsage':
        case 'PortUsage':
        case 'ActionUsage':
        case 'StateUsage':
        case 'ConnectionUsage':
        case 'AllocationUsage':
            return SymbolKind.USAGE;
        case 'Feature':
            return SymbolKind.FEATURE;
        case 'Import':
            return SymbolKind.IMPORT;
        case 'Specialization':
        case 'FeatureTyping':
            return SymbolKind.RELATIONSHIP;
        default:
            return SymbolKind.NAMESPACE;
    }
}
// Helper to check if a node type creates a new naming scope
function createsScope(type) {
    switch (type) {
        case 'Package':
        case 'Namespace':
        case 'PartDefinition':
        case 'AttributeDefinition':
        case 'PortDefinition':
        case 'ActionDefinition':
        case 'StateDefinition':
        case 'RequirementDefinition':
        case 'ConstraintDefinition':
        case 'PartUsage':
        case 'ActionUsage':
        case 'StateUsage':
            return true;
        default:
            return false;
    }
}
// Helper to extract name from a node
function getNodeName(node) {
    return node.name;
}
// Helper to check if a node has members
function getMembers(node) {
    const members = node.members;
    return members ?? [];
}
// Helper to get imports from a node
function getImports(node) {
    const imports = node.imports;
    return imports ?? [];
}
/** Build scopes from an AST */
export class ScopeBuilder {
    symbolTable;
    constructor(symbolTable) {
        this.symbolTable = symbolTable;
    }
    /** Build the scope tree from an AST root */
    buildScopes(root) {
        const rootScope = new Scope('');
        this.buildScopeForNode(root, rootScope);
        return rootScope;
    }
    buildScopeForNode(node, currentScope) {
        const name = getNodeName(node);
        if (name) {
            const qualifiedName = currentScope.getQualifiedName()
                ? `${currentScope.getQualifiedName()}::${name}`
                : name;
            const symbol = {
                name,
                qualifiedName,
                kind: getSymbolKind(node.$type),
                node,
                scope: currentScope,
            };
            currentScope.define(symbol);
            this.symbolTable.addSymbol(symbol);
            // If this node creates a new scope, create a child scope for its body
            if (createsScope(node.$type)) {
                const childScope = currentScope.createChild(name);
                this.processChildren(node, childScope);
                this.processImports(node, childScope);
                return;
            }
        }
        // For unnamed nodes or nodes that don't create scopes, process children in the current scope
        this.processChildren(node, currentScope);
        this.processImports(node, currentScope);
    }
    processChildren(node, scope) {
        const members = getMembers(node);
        for (const member of members) {
            if (member.$type === 'Membership') {
                const memberElement = member.memberElement;
                if (memberElement) {
                    this.buildScopeForNode(memberElement, scope);
                }
            }
            else {
                this.buildScopeForNode(member, scope);
            }
        }
    }
    processImports(node, scope) {
        const imports = getImports(node);
        for (const imp of imports) {
            const importedNamespace = imp.importedNamespace;
            const isRecursive = imp.isRecursive;
            const isAll = imp.isAll;
            const visibility = imp.visibility ?? 'public';
            if (importedNamespace) {
                scope.addImport({
                    namespacePath: importedNamespace,
                    isAll: isAll ?? false,
                    isRecursive: isRecursive ?? false,
                    visibility,
                });
            }
            // Also register the import node as a symbol
            const importSymbol = {
                name: importedNamespace ?? '<unknown>',
                qualifiedName: `${scope.getQualifiedName() || '<root>'}::import::${importedNamespace ?? '<unknown>'}`,
                kind: SymbolKind.IMPORT,
                node: imp,
                scope,
            };
            this.symbolTable.addSymbol(importSymbol);
        }
    }
}
//# sourceMappingURL=scope.js.map