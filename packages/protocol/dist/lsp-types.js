/** Completion item kind for SysML elements */
export var CompletionItemKind;
(function (CompletionItemKind) {
    CompletionItemKind[CompletionItemKind["KEYWORD"] = 1] = "KEYWORD";
    CompletionItemKind[CompletionItemKind["PACKAGE"] = 2] = "PACKAGE";
    CompletionItemKind[CompletionItemKind["DEFINITION"] = 3] = "DEFINITION";
    CompletionItemKind[CompletionItemKind["USAGE"] = 4] = "USAGE";
    CompletionItemKind[CompletionItemKind["RELATIONSHIP"] = 5] = "RELATIONSHIP";
    CompletionItemKind[CompletionItemKind["SNIPPET"] = 6] = "SNIPPET";
})(CompletionItemKind || (CompletionItemKind = {}));
/** Symbol information for document outline */
export var SymbolKind;
(function (SymbolKind) {
    SymbolKind[SymbolKind["PACKAGE"] = 1] = "PACKAGE";
    SymbolKind[SymbolKind["DEFINITION"] = 2] = "DEFINITION";
    SymbolKind[SymbolKind["USAGE"] = 3] = "USAGE";
    SymbolKind[SymbolKind["RELATIONSHIP"] = 4] = "RELATIONSHIP";
    SymbolKind[SymbolKind["COMMENT"] = 5] = "COMMENT";
})(SymbolKind || (SymbolKind = {}));
//# sourceMappingURL=lsp-types.js.map