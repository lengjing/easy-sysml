import { TokenKind, Lexer } from './lexer.js';
let idCounter = 0;
function makeId() {
    return `p-${Date.now()}-${++idCounter}`;
}
export class SysMLParser {
    tokens = [];
    pos = 0;
    errors = [];
    parse(source, uri) {
        const lexer = new Lexer(source);
        const { tokens: allTokens, errors: lexerErrors } = lexer.tokenize();
        // Filter out whitespace, newlines, and comments for parsing
        this.tokens = allTokens.filter((t) => t.kind !== TokenKind.WHITESPACE &&
            t.kind !== TokenKind.NEWLINE &&
            t.kind !== TokenKind.COMMENT &&
            t.kind !== TokenKind.BLOCK_COMMENT &&
            t.kind !== TokenKind.DOC_COMMENT);
        this.pos = 0;
        this.errors = [];
        const root = {
            $type: 'Package',
            $id: makeId(),
            name: uri ?? '<root>',
            members: [],
            imports: [],
        };
        if (uri) {
            root.$document = { uri };
        }
        this.parsePackageBody(root);
        if (!this.check(TokenKind.EOF)) {
            this.reportError('Expected end of input', this.peek());
        }
        return {
            ast: root,
            errors: this.errors,
            lexerErrors,
            success: this.errors.length === 0 && lexerErrors.length === 0,
        };
    }
    // ── Token navigation ──
    peek() {
        return this.tokens[this.pos] ?? {
            kind: TokenKind.EOF, text: '', offset: 0, line: 0, column: 0, length: 0,
        };
    }
    advance() {
        const token = this.peek();
        if (token.kind !== TokenKind.EOF) {
            this.pos++;
        }
        return token;
    }
    check(kind) {
        return this.peek().kind === kind;
    }
    match(...kinds) {
        if (kinds.includes(this.peek().kind)) {
            this.advance();
            return true;
        }
        return false;
    }
    expect(kind) {
        const token = this.peek();
        if (token.kind === kind) {
            return this.advance();
        }
        this.reportError(`Expected '${kind}' but found '${token.text || token.kind}'`, token);
        return token;
    }
    // ── Parsing methods ──
    parsePackageBody(pkg) {
        while (!this.check(TokenKind.EOF) && !this.check(TokenKind.RBRACE)) {
            const member = this.parsePackageMember();
            if (member) {
                if (member.$type === 'Import') {
                    pkg.imports.push(member);
                }
                else {
                    const membership = this.wrapInMembership(member);
                    pkg.members.push(membership);
                }
            }
            else {
                // Couldn't parse anything — avoid infinite loop
                if (!this.check(TokenKind.EOF) && !this.check(TokenKind.RBRACE)) {
                    this.reportError(`Unexpected token '${this.peek().text || this.peek().kind}'`, this.peek());
                    this.advance();
                }
            }
        }
    }
    parsePackageMember() {
        const token = this.peek();
        // Visibility prefix
        let visibility;
        if (token.kind === TokenKind.PUBLIC ||
            token.kind === TokenKind.PRIVATE ||
            token.kind === TokenKind.PROTECTED) {
            visibility = token.text;
            this.advance();
        }
        const current = this.peek();
        switch (current.kind) {
            case TokenKind.PACKAGE:
                return this.parsePackageDeclaration();
            case TokenKind.IMPORT:
                return this.parseImport(visibility);
            case TokenKind.PART:
                return this.parsePartDefOrUsage();
            case TokenKind.ATTRIBUTE:
                return this.parseAttributeDefOrUsage();
            case TokenKind.PORT:
                return this.parsePortDefOrUsage();
            case TokenKind.ACTION:
                return this.parseActionDefOrUsage();
            case TokenKind.STATE:
                return this.parseStateDefOrUsage();
            case TokenKind.CONNECTION:
                return this.parseConnectionUsage();
            case TokenKind.ALLOCATION:
                return this.parseAllocationUsage();
            case TokenKind.REQUIREMENT:
                return this.parseRequirementDefinition();
            case TokenKind.CONSTRAINT:
                return this.parseConstraintDefinition();
            case TokenKind.COMMENT_KW:
                return this.parseComment();
            case TokenKind.DOC:
                return this.parseDocumentation();
            case TokenKind.ABSTRACT:
                return this.parseAbstractDef();
            case TokenKind.IN:
            case TokenKind.OUT:
            case TokenKind.INOUT:
                return this.parseDirectedPortUsage();
            default:
                if (visibility) {
                    // We consumed a visibility keyword but nothing follows
                    this.reportError(`Expected declaration after visibility '${visibility}'`, current);
                }
                return undefined;
        }
    }
    parsePackageDeclaration() {
        this.expect(TokenKind.PACKAGE);
        const name = this.parseIdentifierName();
        const pkg = {
            $type: 'Package',
            $id: makeId(),
            name,
            members: [],
            imports: [],
        };
        if (this.match(TokenKind.LBRACE)) {
            this.parsePackageBody(pkg);
            this.expect(TokenKind.RBRACE);
        }
        else {
            this.expect(TokenKind.SEMICOLON);
        }
        return pkg;
    }
    parseImport(visibility) {
        this.expect(TokenKind.IMPORT);
        const isAll = this.match(TokenKind.ALL);
        const qualifiedName = this.parseQualifiedName();
        // Check for ::*
        let importedName = qualifiedName;
        let isWildcard = false;
        if (this.check(TokenKind.COLONCOLON) && this.lookAhead(1)?.kind === TokenKind.STAR) {
            this.advance(); // ::
            this.advance(); // *
            importedName = qualifiedName + '::*';
            isWildcard = true;
        }
        this.expect(TokenKind.SEMICOLON);
        return {
            $type: 'Import',
            $id: makeId(),
            visibility: visibility === 'protected' ? undefined : visibility,
            importedNamespace: importedName,
            isRecursive: false,
            isAll,
        };
    }
    parsePartDefOrUsage() {
        this.expect(TokenKind.PART);
        if (this.check(TokenKind.DEF)) {
            return this.parsePartDefinition(false);
        }
        return this.parsePartUsage();
    }
    parsePartDefinition(isAbstract) {
        this.expect(TokenKind.DEF);
        const name = this.parseIdentifierName();
        const node = {
            $type: 'PartDefinition',
            $id: makeId(),
            name,
            isAbstract,
            members: [],
            specializations: [],
        };
        // Specializations: :> General1, General2
        if (this.match(TokenKind.COLONGT)) {
            do {
                const general = this.parseQualifiedName();
                node.specializations.push({
                    $type: 'Specialization',
                    $id: makeId(),
                    general,
                });
            } while (this.match(TokenKind.COMMA));
        }
        if (this.match(TokenKind.LBRACE)) {
            this.parseDefinitionBody(node.members);
            this.expect(TokenKind.RBRACE);
        }
        else {
            this.expect(TokenKind.SEMICOLON);
        }
        return node;
    }
    parsePartUsage() {
        const name = this.parseIdentifierName();
        const node = {
            $type: 'PartUsage',
            $id: makeId(),
            name,
            typings: [],
            members: [],
        };
        // Typing: : TypeName
        if (this.match(TokenKind.COLON)) {
            const typeName = this.parseQualifiedName();
            node.typings.push({
                $type: 'FeatureTyping',
                $id: makeId(),
                type: typeName,
            });
        }
        // Multiplicity
        node.multiplicity = this.parseMultiplicity();
        if (this.match(TokenKind.LBRACE)) {
            this.parseDefinitionBody(node.members);
            this.expect(TokenKind.RBRACE);
        }
        else {
            this.expect(TokenKind.SEMICOLON);
        }
        return node;
    }
    parseAttributeDefOrUsage() {
        this.expect(TokenKind.ATTRIBUTE);
        if (this.check(TokenKind.DEF)) {
            return this.parseAttributeDefinition(false);
        }
        return this.parseAttributeUsage();
    }
    parseAttributeDefinition(isAbstract) {
        this.expect(TokenKind.DEF);
        const name = this.parseIdentifierName();
        const node = {
            $type: 'AttributeDefinition',
            $id: makeId(),
            name,
            isAbstract,
            members: [],
        };
        if (this.match(TokenKind.LBRACE)) {
            this.parseDefinitionBody(node.members);
            this.expect(TokenKind.RBRACE);
        }
        else {
            this.expect(TokenKind.SEMICOLON);
        }
        return node;
    }
    parseAttributeUsage() {
        const name = this.parseIdentifierName();
        const node = {
            $type: 'AttributeUsage',
            $id: makeId(),
            name,
            typings: [],
        };
        if (this.match(TokenKind.COLON)) {
            const typeName = this.parseQualifiedName();
            node.typings.push({
                $type: 'FeatureTyping',
                $id: makeId(),
                type: typeName,
            });
        }
        if (this.match(TokenKind.EQUALS)) {
            node.value = this.parseExpression();
        }
        this.expect(TokenKind.SEMICOLON);
        return node;
    }
    parsePortDefOrUsage() {
        this.expect(TokenKind.PORT);
        if (this.check(TokenKind.DEF)) {
            return this.parsePortDefinition(false);
        }
        return this.parsePortUsage();
    }
    parsePortDefinition(isAbstract) {
        this.expect(TokenKind.DEF);
        const name = this.parseIdentifierName();
        const node = {
            $type: 'PortDefinition',
            $id: makeId(),
            name,
            isAbstract,
            members: [],
        };
        if (this.match(TokenKind.LBRACE)) {
            this.parseDefinitionBody(node.members);
            this.expect(TokenKind.RBRACE);
        }
        else {
            this.expect(TokenKind.SEMICOLON);
        }
        return node;
    }
    parsePortUsage(direction) {
        const name = this.parseIdentifierName();
        const node = {
            $type: 'PortUsage',
            $id: makeId(),
            name,
            direction,
            typings: [],
        };
        if (this.match(TokenKind.COLON)) {
            const typeName = this.parseQualifiedName();
            node.typings.push({
                $type: 'FeatureTyping',
                $id: makeId(),
                type: typeName,
            });
        }
        this.expect(TokenKind.SEMICOLON);
        return node;
    }
    parseDirectedPortUsage() {
        const dirToken = this.advance();
        const direction = dirToken.text;
        this.expect(TokenKind.PORT);
        return this.parsePortUsage(direction);
    }
    parseActionDefOrUsage() {
        this.expect(TokenKind.ACTION);
        if (this.check(TokenKind.DEF)) {
            return this.parseActionDefinition(false);
        }
        return this.parseActionUsage();
    }
    parseActionDefinition(isAbstract) {
        this.expect(TokenKind.DEF);
        const name = this.parseIdentifierName();
        const node = {
            $type: 'ActionDefinition',
            $id: makeId(),
            name,
            isAbstract,
            members: [],
        };
        if (this.match(TokenKind.LBRACE)) {
            this.parseDefinitionBody(node.members);
            this.expect(TokenKind.RBRACE);
        }
        else {
            this.expect(TokenKind.SEMICOLON);
        }
        return node;
    }
    parseActionUsage() {
        const name = this.parseIdentifierName();
        const node = {
            $type: 'ActionUsage',
            $id: makeId(),
            name,
            typings: [],
            members: [],
        };
        if (this.match(TokenKind.COLON)) {
            const typeName = this.parseQualifiedName();
            node.typings.push({
                $type: 'FeatureTyping',
                $id: makeId(),
                type: typeName,
            });
        }
        if (this.match(TokenKind.LBRACE)) {
            this.parseDefinitionBody(node.members);
            this.expect(TokenKind.RBRACE);
        }
        else {
            this.expect(TokenKind.SEMICOLON);
        }
        return node;
    }
    parseStateDefOrUsage() {
        this.expect(TokenKind.STATE);
        if (this.check(TokenKind.DEF)) {
            return this.parseStateDefinition(false);
        }
        return this.parseStateUsage();
    }
    parseStateDefinition(isAbstract) {
        this.expect(TokenKind.DEF);
        const name = this.parseIdentifierName();
        const node = {
            $type: 'StateDefinition',
            $id: makeId(),
            name,
            isAbstract,
            members: [],
        };
        if (this.match(TokenKind.LBRACE)) {
            this.parseDefinitionBody(node.members);
            this.expect(TokenKind.RBRACE);
        }
        else {
            this.expect(TokenKind.SEMICOLON);
        }
        return node;
    }
    parseStateUsage() {
        const name = this.parseIdentifierName();
        const node = {
            $type: 'StateUsage',
            $id: makeId(),
            name,
            typings: [],
            members: [],
        };
        if (this.match(TokenKind.COLON)) {
            const typeName = this.parseQualifiedName();
            node.typings.push({
                $type: 'FeatureTyping',
                $id: makeId(),
                type: typeName,
            });
        }
        if (this.match(TokenKind.LBRACE)) {
            this.parseDefinitionBody(node.members);
            this.expect(TokenKind.RBRACE);
        }
        else {
            this.expect(TokenKind.SEMICOLON);
        }
        return node;
    }
    parseConnectionUsage() {
        this.expect(TokenKind.CONNECTION);
        const name = this.parseIdentifierName();
        const node = {
            $type: 'ConnectionUsage',
            $id: makeId(),
            name,
            ends: [],
        };
        if (this.match(TokenKind.LBRACE)) {
            this.skipBody();
            this.expect(TokenKind.RBRACE);
        }
        else {
            this.expect(TokenKind.SEMICOLON);
        }
        return node;
    }
    parseAllocationUsage() {
        this.expect(TokenKind.ALLOCATION);
        const name = this.parseIdentifierName();
        const node = {
            $type: 'AllocationUsage',
            $id: makeId(),
            name,
        };
        if (this.match(TokenKind.LBRACE)) {
            this.skipBody();
            this.expect(TokenKind.RBRACE);
        }
        else {
            this.expect(TokenKind.SEMICOLON);
        }
        return node;
    }
    parseRequirementDefinition() {
        this.expect(TokenKind.REQUIREMENT);
        this.expect(TokenKind.DEF);
        const name = this.parseIdentifierName();
        const node = {
            $type: 'RequirementDefinition',
            $id: makeId(),
            name,
            members: [],
        };
        if (this.match(TokenKind.LBRACE)) {
            this.parseDefinitionBody(node.members);
            this.expect(TokenKind.RBRACE);
        }
        else {
            this.expect(TokenKind.SEMICOLON);
        }
        return node;
    }
    parseConstraintDefinition() {
        this.expect(TokenKind.CONSTRAINT);
        this.expect(TokenKind.DEF);
        const name = this.parseIdentifierName();
        const node = {
            $type: 'ConstraintDefinition',
            $id: makeId(),
            name,
            members: [],
        };
        if (this.match(TokenKind.LBRACE)) {
            this.parseDefinitionBody(node.members);
            this.expect(TokenKind.RBRACE);
        }
        else {
            this.expect(TokenKind.SEMICOLON);
        }
        return node;
    }
    parseAbstractDef() {
        this.expect(TokenKind.ABSTRACT);
        const next = this.peek();
        switch (next.kind) {
            case TokenKind.PART:
                this.advance();
                return this.parsePartDefinition(true);
            case TokenKind.ATTRIBUTE:
                this.advance();
                return this.parseAttributeDefinition(true);
            case TokenKind.PORT:
                this.advance();
                return this.parsePortDefinition(true);
            case TokenKind.ACTION:
                this.advance();
                return this.parseActionDefinition(true);
            case TokenKind.STATE:
                this.advance();
                return this.parseStateDefinition(true);
            default:
                this.reportError(`Expected definition keyword after 'abstract'`, next);
                return undefined;
        }
    }
    parseComment() {
        this.expect(TokenKind.COMMENT_KW);
        const node = {
            $type: 'Comment',
            $id: makeId(),
            body: '',
        };
        if (this.match(TokenKind.ABOUT)) {
            const refs = [];
            refs.push(this.parseQualifiedName());
            while (this.match(TokenKind.COMMA)) {
                refs.push(this.parseQualifiedName());
            }
            node.about = refs;
        }
        // The comment body can be a block comment or a string
        if (this.check(TokenKind.STRING)) {
            const tok = this.advance();
            node.body = tok.text.slice(1, -1); // strip quotes
        }
        if (this.check(TokenKind.SEMICOLON)) {
            this.advance();
        }
        return node;
    }
    parseDocumentation() {
        this.expect(TokenKind.DOC);
        const node = {
            $type: 'Documentation',
            $id: makeId(),
            body: '',
        };
        if (this.check(TokenKind.STRING)) {
            const tok = this.advance();
            node.body = tok.text.slice(1, -1);
        }
        if (this.check(TokenKind.SEMICOLON)) {
            this.advance();
        }
        return node;
    }
    // ── Shared parsing helpers ──
    parseDefinitionBody(members) {
        while (!this.check(TokenKind.EOF) && !this.check(TokenKind.RBRACE)) {
            const member = this.parsePackageMember();
            if (member) {
                if (member.$type === 'Import') {
                    // Imports in body — just wrap in membership
                    members.push(this.wrapInMembership(member));
                }
                else {
                    members.push(this.wrapInMembership(member));
                }
            }
            else {
                if (!this.check(TokenKind.EOF) && !this.check(TokenKind.RBRACE)) {
                    this.reportError(`Unexpected token '${this.peek().text || this.peek().kind}'`, this.peek());
                    this.synchronize();
                }
            }
        }
    }
    parseQualifiedName() {
        let name = this.parseIdentifierName();
        while (this.check(TokenKind.COLONCOLON)) {
            // Only consume :: if followed by a name (not *)
            const nextAfterColon = this.lookAhead(1);
            if (nextAfterColon &&
                (nextAfterColon.kind === TokenKind.IDENTIFIER ||
                    nextAfterColon.kind === TokenKind.STAR ||
                    KEYWORDS_AS_IDENT.has(nextAfterColon.kind))) {
                // Only consume :: + name if it's not ::* (wildcard handled by caller)
                if (nextAfterColon.kind === TokenKind.STAR) {
                    break;
                }
                this.advance(); // consume ::
                name += '::' + this.parseIdentifierName();
            }
            else {
                break;
            }
        }
        return name;
    }
    parseIdentifierName() {
        const token = this.peek();
        if (token.kind === TokenKind.IDENTIFIER) {
            this.advance();
            // Handle unrestricted names (strip quotes)
            if (token.text.startsWith("'") && token.text.endsWith("'")) {
                return token.text.slice(1, -1);
            }
            return token.text;
        }
        // Allow keywords used as identifiers in name position
        if (KEYWORDS_AS_IDENT.has(token.kind)) {
            this.advance();
            return token.text;
        }
        this.reportError(`Expected identifier but found '${token.text || token.kind}'`, token);
        return '<error>';
    }
    parseMultiplicity() {
        if (!this.check(TokenKind.LBRACKET)) {
            return undefined;
        }
        this.advance(); // [
        const node = {
            $type: 'Multiplicity',
            $id: makeId(),
        };
        if (this.check(TokenKind.STAR)) {
            this.advance();
            node.upper = '*';
        }
        else if (this.check(TokenKind.INTEGER)) {
            const lower = parseInt(this.advance().text, 10);
            if (this.match(TokenKind.DOTDOT)) {
                node.lower = lower;
                if (this.check(TokenKind.STAR)) {
                    this.advance();
                    node.upper = '*';
                }
                else if (this.check(TokenKind.INTEGER)) {
                    node.upper = parseInt(this.advance().text, 10);
                }
            }
            else {
                // Single value — both lower and upper
                node.lower = lower;
                node.upper = lower;
            }
        }
        this.expect(TokenKind.RBRACKET);
        return node;
    }
    parseExpression() {
        return this.parseLiteral();
    }
    parseLiteral() {
        const token = this.peek();
        switch (token.kind) {
            case TokenKind.INTEGER: {
                this.advance();
                return {
                    $type: 'LiteralInteger',
                    $id: makeId(),
                    value: parseInt(token.text, 10),
                };
            }
            case TokenKind.REAL: {
                this.advance();
                return {
                    $type: 'LiteralReal',
                    $id: makeId(),
                    value: parseFloat(token.text),
                };
            }
            case TokenKind.STRING: {
                this.advance();
                return {
                    $type: 'LiteralString',
                    $id: makeId(),
                    value: token.text.slice(1, -1),
                };
            }
            case TokenKind.TRUE: {
                this.advance();
                return {
                    $type: 'LiteralBoolean',
                    $id: makeId(),
                    value: true,
                };
            }
            case TokenKind.FALSE: {
                this.advance();
                return {
                    $type: 'LiteralBoolean',
                    $id: makeId(),
                    value: false,
                };
            }
            case TokenKind.LPAREN: {
                this.advance(); // (
                const expr = this.parseExpression();
                this.expect(TokenKind.RPAREN);
                return expr;
            }
            case TokenKind.IDENTIFIER:
            default:
                // QualifiedName reference as expression
                if (token.kind === TokenKind.IDENTIFIER || KEYWORDS_AS_IDENT.has(token.kind)) {
                    this.parseQualifiedName();
                    return {
                        $type: 'Expression',
                        $id: makeId(),
                    };
                }
                return undefined;
        }
    }
    // ── Error recovery ──
    reportError(message, token) {
        const t = token ?? this.peek();
        this.errors.push({
            message,
            line: t.line,
            column: t.column,
            offset: t.offset,
            length: t.length || 1,
        });
    }
    synchronize() {
        while (!this.check(TokenKind.EOF)) {
            const kind = this.peek().kind;
            if (kind === TokenKind.SEMICOLON) {
                this.advance();
                return;
            }
            if (kind === TokenKind.RBRACE) {
                return; // don't consume — let the caller handle it
            }
            this.advance();
        }
    }
    skipBody() {
        let depth = 1;
        while (!this.check(TokenKind.EOF) && depth > 0) {
            if (this.check(TokenKind.LBRACE)) {
                depth++;
            }
            else if (this.check(TokenKind.RBRACE)) {
                depth--;
                if (depth === 0)
                    return;
            }
            this.advance();
        }
    }
    wrapInMembership(element) {
        const name = element.name;
        return {
            $type: 'Membership',
            $id: makeId(),
            memberName: name,
            memberElement: element,
        };
    }
    lookAhead(offset) {
        const idx = this.pos + offset;
        return idx < this.tokens.length ? this.tokens[idx] : undefined;
    }
}
/** Token kinds that can be used as identifiers in name position */
const KEYWORDS_AS_IDENT = new Set([
    // Many SysML keywords are context-sensitive and can appear as names
    TokenKind.ABOUT,
    TokenKind.ALL,
    TokenKind.ALIAS,
    TokenKind.DOC,
    TokenKind.ENTRY,
    TokenKind.EXIT,
    TokenKind.FILTER,
    TokenKind.FIRST,
    TokenKind.FROM,
    TokenKind.INDIVIDUAL,
    TokenKind.ITEM,
    TokenKind.LOOP,
    TokenKind.ORDERED,
    TokenKind.NONUNIQUE,
    TokenKind.RENDER,
    TokenKind.SNAPSHOT,
    TokenKind.THEN,
    TokenKind.TIMESLICE,
    TokenKind.TO,
    TokenKind.VIA,
    TokenKind.VIEW,
    TokenKind.VARIATION,
    TokenKind.VARIANT,
]);
//# sourceMappingURL=parser.js.map