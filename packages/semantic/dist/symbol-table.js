export var SymbolKind;
(function (SymbolKind) {
    SymbolKind["PACKAGE"] = "package";
    SymbolKind["DEFINITION"] = "definition";
    SymbolKind["USAGE"] = "usage";
    SymbolKind["FEATURE"] = "feature";
    SymbolKind["RELATIONSHIP"] = "relationship";
    SymbolKind["IMPORT"] = "import";
    SymbolKind["NAMESPACE"] = "namespace";
})(SymbolKind || (SymbolKind = {}));
/** Symbol table storing all symbols indexed by name and qualified name */
export class SymbolTable {
    symbols = new Map();
    byQualifiedName = new Map();
    byNode = new Map();
    /** Add a symbol to the table */
    addSymbol(symbol) {
        const existing = this.symbols.get(symbol.name);
        if (existing) {
            existing.push(symbol);
        }
        else {
            this.symbols.set(symbol.name, [symbol]);
        }
        this.byQualifiedName.set(symbol.qualifiedName, symbol);
        this.byNode.set(symbol.node, symbol);
    }
    /** Get symbols by simple name */
    getByName(name) {
        return this.symbols.get(name) ?? [];
    }
    /** Get a symbol by its qualified name */
    getByQualifiedName(qualifiedName) {
        return this.byQualifiedName.get(qualifiedName);
    }
    /** Get the symbol for an AST node */
    getForNode(node) {
        return this.byNode.get(node);
    }
    /** Get all symbols */
    getAllSymbols() {
        const result = [];
        for (const syms of this.symbols.values()) {
            result.push(...syms);
        }
        return result;
    }
    /** Remove symbol */
    removeSymbol(symbol) {
        const byName = this.symbols.get(symbol.name);
        if (byName) {
            const idx = byName.indexOf(symbol);
            if (idx !== -1) {
                byName.splice(idx, 1);
            }
            if (byName.length === 0) {
                this.symbols.delete(symbol.name);
            }
        }
        this.byQualifiedName.delete(symbol.qualifiedName);
        this.byNode.delete(symbol.node);
    }
    /** Clear all symbols */
    clear() {
        this.symbols.clear();
        this.byQualifiedName.clear();
        this.byNode.clear();
    }
}
//# sourceMappingURL=symbol-table.js.map