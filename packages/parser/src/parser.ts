import { TokenKind, Lexer } from './lexer.js';
import type { Token, LexerError } from './lexer.js';
import type {
  AstNode,
  PackageNode,
  MembershipNode,
  ImportNode,
  PartDefinitionNode,
  PartUsageNode,
  AttributeDefinitionNode,
  AttributeUsageNode,
  PortDefinitionNode,
  PortUsageNode,
  ActionDefinitionNode,
  ActionUsageNode,
  StateDefinitionNode,
  StateUsageNode,
  ConnectionUsageNode,
  AllocationUsageNode,
  RequirementDefinitionNode,
  ConstraintDefinitionNode,
  MultiplicityNode,
  ExpressionNode,
  CommentNode,
  DocumentationNode,
} from '@easy-sysml/ast';

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

let idCounter = 0;
function makeId(): string {
  return `p-${Date.now()}-${++idCounter}`;
}

export class SysMLParser {
  private tokens: Token[] = [];
  private pos = 0;
  private errors: ParseError[] = [];

  parse(source: string, uri?: string): ParseResult {
    const lexer = new Lexer(source);
    const { tokens: allTokens, errors: lexerErrors } = lexer.tokenize();

    // Filter out whitespace, newlines, and comments for parsing
    this.tokens = allTokens.filter(
      (t) =>
        t.kind !== TokenKind.WHITESPACE &&
        t.kind !== TokenKind.NEWLINE &&
        t.kind !== TokenKind.COMMENT &&
        t.kind !== TokenKind.BLOCK_COMMENT &&
        t.kind !== TokenKind.DOC_COMMENT,
    );
    this.pos = 0;
    this.errors = [];

    const root: PackageNode = {
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

  private peek(): Token {
    return this.tokens[this.pos] ?? {
      kind: TokenKind.EOF, text: '', offset: 0, line: 0, column: 0, length: 0,
    };
  }

  private advance(): Token {
    const token = this.peek();
    if (token.kind !== TokenKind.EOF) {
      this.pos++;
    }
    return token;
  }

  private check(kind: TokenKind): boolean {
    return this.peek().kind === kind;
  }

  private match(...kinds: TokenKind[]): boolean {
    if (kinds.includes(this.peek().kind)) {
      this.advance();
      return true;
    }
    return false;
  }

  private expect(kind: TokenKind): Token {
    const token = this.peek();
    if (token.kind === kind) {
      return this.advance();
    }
    this.reportError(`Expected '${kind}' but found '${token.text || token.kind}'`, token);
    return token;
  }

  // ── Parsing methods ──

  private parsePackageBody(pkg: PackageNode): void {
    while (!this.check(TokenKind.EOF) && !this.check(TokenKind.RBRACE)) {
      const member = this.parsePackageMember();
      if (member) {
        if (member.$type === 'Import') {
          pkg.imports.push(member as ImportNode);
        } else {
          const membership = this.wrapInMembership(member);
          pkg.members.push(membership);
        }
      } else {
        // Couldn't parse anything — avoid infinite loop
        if (!this.check(TokenKind.EOF) && !this.check(TokenKind.RBRACE)) {
          this.reportError(`Unexpected token '${this.peek().text || this.peek().kind}'`, this.peek());
          this.advance();
        }
      }
    }
  }

  private parsePackageMember(): AstNode | undefined {
    const token = this.peek();

    // Visibility prefix
    let visibility: 'public' | 'private' | 'protected' | undefined;
    if (
      token.kind === TokenKind.PUBLIC ||
      token.kind === TokenKind.PRIVATE ||
      token.kind === TokenKind.PROTECTED
    ) {
      visibility = token.text as 'public' | 'private' | 'protected';
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

  private parsePackageDeclaration(): PackageNode {
    this.expect(TokenKind.PACKAGE);
    const name = this.parseIdentifierName();

    const pkg: PackageNode = {
      $type: 'Package',
      $id: makeId(),
      name,
      members: [],
      imports: [],
    };

    if (this.match(TokenKind.LBRACE)) {
      this.parsePackageBody(pkg);
      this.expect(TokenKind.RBRACE);
    } else {
      this.expect(TokenKind.SEMICOLON);
    }

    return pkg;
  }

  private parseImport(visibility?: 'public' | 'private' | 'protected'): ImportNode {
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

  private parsePartDefOrUsage(): AstNode {
    this.expect(TokenKind.PART);

    if (this.check(TokenKind.DEF)) {
      return this.parsePartDefinition(false);
    }
    return this.parsePartUsage();
  }

  private parsePartDefinition(isAbstract: boolean): PartDefinitionNode {
    this.expect(TokenKind.DEF);
    const name = this.parseIdentifierName();

    const node: PartDefinitionNode = {
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
    } else {
      this.expect(TokenKind.SEMICOLON);
    }

    return node;
  }

  private parsePartUsage(): PartUsageNode {
    const name = this.parseIdentifierName();

    const node: PartUsageNode = {
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
    } else {
      this.expect(TokenKind.SEMICOLON);
    }

    return node;
  }

  private parseAttributeDefOrUsage(): AstNode {
    this.expect(TokenKind.ATTRIBUTE);

    if (this.check(TokenKind.DEF)) {
      return this.parseAttributeDefinition(false);
    }
    return this.parseAttributeUsage();
  }

  private parseAttributeDefinition(isAbstract: boolean): AttributeDefinitionNode {
    this.expect(TokenKind.DEF);
    const name = this.parseIdentifierName();

    const node: AttributeDefinitionNode = {
      $type: 'AttributeDefinition',
      $id: makeId(),
      name,
      isAbstract,
      members: [],
    };

    if (this.match(TokenKind.LBRACE)) {
      this.parseDefinitionBody(node.members);
      this.expect(TokenKind.RBRACE);
    } else {
      this.expect(TokenKind.SEMICOLON);
    }

    return node;
  }

  private parseAttributeUsage(): AttributeUsageNode {
    const name = this.parseIdentifierName();

    const node: AttributeUsageNode = {
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

  private parsePortDefOrUsage(): AstNode {
    this.expect(TokenKind.PORT);

    if (this.check(TokenKind.DEF)) {
      return this.parsePortDefinition(false);
    }
    return this.parsePortUsage();
  }

  private parsePortDefinition(isAbstract: boolean): PortDefinitionNode {
    this.expect(TokenKind.DEF);
    const name = this.parseIdentifierName();

    const node: PortDefinitionNode = {
      $type: 'PortDefinition',
      $id: makeId(),
      name,
      isAbstract,
      members: [],
    };

    if (this.match(TokenKind.LBRACE)) {
      this.parseDefinitionBody(node.members);
      this.expect(TokenKind.RBRACE);
    } else {
      this.expect(TokenKind.SEMICOLON);
    }

    return node;
  }

  private parsePortUsage(direction?: 'in' | 'out' | 'inout'): PortUsageNode {
    const name = this.parseIdentifierName();

    const node: PortUsageNode = {
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

  private parseDirectedPortUsage(): PortUsageNode {
    const dirToken = this.advance();
    const direction = dirToken.text as 'in' | 'out' | 'inout';
    this.expect(TokenKind.PORT);
    return this.parsePortUsage(direction);
  }

  private parseActionDefOrUsage(): AstNode {
    this.expect(TokenKind.ACTION);

    if (this.check(TokenKind.DEF)) {
      return this.parseActionDefinition(false);
    }
    return this.parseActionUsage();
  }

  private parseActionDefinition(isAbstract: boolean): ActionDefinitionNode {
    this.expect(TokenKind.DEF);
    const name = this.parseIdentifierName();

    const node: ActionDefinitionNode = {
      $type: 'ActionDefinition',
      $id: makeId(),
      name,
      isAbstract,
      members: [],
    };

    if (this.match(TokenKind.LBRACE)) {
      this.parseDefinitionBody(node.members);
      this.expect(TokenKind.RBRACE);
    } else {
      this.expect(TokenKind.SEMICOLON);
    }

    return node;
  }

  private parseActionUsage(): ActionUsageNode {
    const name = this.parseIdentifierName();

    const node: ActionUsageNode = {
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
    } else {
      this.expect(TokenKind.SEMICOLON);
    }

    return node;
  }

  private parseStateDefOrUsage(): AstNode {
    this.expect(TokenKind.STATE);

    if (this.check(TokenKind.DEF)) {
      return this.parseStateDefinition(false);
    }
    return this.parseStateUsage();
  }

  private parseStateDefinition(isAbstract: boolean): StateDefinitionNode {
    this.expect(TokenKind.DEF);
    const name = this.parseIdentifierName();

    const node: StateDefinitionNode = {
      $type: 'StateDefinition',
      $id: makeId(),
      name,
      isAbstract,
      members: [],
    };

    if (this.match(TokenKind.LBRACE)) {
      this.parseDefinitionBody(node.members);
      this.expect(TokenKind.RBRACE);
    } else {
      this.expect(TokenKind.SEMICOLON);
    }

    return node;
  }

  private parseStateUsage(): StateUsageNode {
    const name = this.parseIdentifierName();

    const node: StateUsageNode = {
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
    } else {
      this.expect(TokenKind.SEMICOLON);
    }

    return node;
  }

  private parseConnectionUsage(): ConnectionUsageNode {
    this.expect(TokenKind.CONNECTION);
    const name = this.parseIdentifierName();

    const node: ConnectionUsageNode = {
      $type: 'ConnectionUsage',
      $id: makeId(),
      name,
      ends: [],
    };

    if (this.match(TokenKind.LBRACE)) {
      this.skipBody();
      this.expect(TokenKind.RBRACE);
    } else {
      this.expect(TokenKind.SEMICOLON);
    }

    return node;
  }

  private parseAllocationUsage(): AllocationUsageNode {
    this.expect(TokenKind.ALLOCATION);
    const name = this.parseIdentifierName();

    const node: AllocationUsageNode = {
      $type: 'AllocationUsage',
      $id: makeId(),
      name,
    };

    if (this.match(TokenKind.LBRACE)) {
      this.skipBody();
      this.expect(TokenKind.RBRACE);
    } else {
      this.expect(TokenKind.SEMICOLON);
    }

    return node;
  }

  private parseRequirementDefinition(): RequirementDefinitionNode {
    this.expect(TokenKind.REQUIREMENT);
    this.expect(TokenKind.DEF);
    const name = this.parseIdentifierName();

    const node: RequirementDefinitionNode = {
      $type: 'RequirementDefinition',
      $id: makeId(),
      name,
      members: [],
    };

    if (this.match(TokenKind.LBRACE)) {
      this.parseDefinitionBody(node.members);
      this.expect(TokenKind.RBRACE);
    } else {
      this.expect(TokenKind.SEMICOLON);
    }

    return node;
  }

  private parseConstraintDefinition(): ConstraintDefinitionNode {
    this.expect(TokenKind.CONSTRAINT);
    this.expect(TokenKind.DEF);
    const name = this.parseIdentifierName();

    const node: ConstraintDefinitionNode = {
      $type: 'ConstraintDefinition',
      $id: makeId(),
      name,
      members: [],
    };

    if (this.match(TokenKind.LBRACE)) {
      this.parseDefinitionBody(node.members);
      this.expect(TokenKind.RBRACE);
    } else {
      this.expect(TokenKind.SEMICOLON);
    }

    return node;
  }

  private parseAbstractDef(): AstNode | undefined {
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

  private parseComment(): CommentNode {
    this.expect(TokenKind.COMMENT_KW);

    const node: CommentNode = {
      $type: 'Comment',
      $id: makeId(),
      body: '',
    };

    if (this.match(TokenKind.ABOUT)) {
      const refs: string[] = [];
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

  private parseDocumentation(): DocumentationNode {
    this.expect(TokenKind.DOC);

    const node: DocumentationNode = {
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

  private parseDefinitionBody(members: MembershipNode[]): void {
    while (!this.check(TokenKind.EOF) && !this.check(TokenKind.RBRACE)) {
      const member = this.parsePackageMember();
      if (member) {
        if (member.$type === 'Import') {
          // Imports in body — just wrap in membership
          members.push(this.wrapInMembership(member));
        } else {
          members.push(this.wrapInMembership(member));
        }
      } else {
        if (!this.check(TokenKind.EOF) && !this.check(TokenKind.RBRACE)) {
          this.reportError(`Unexpected token '${this.peek().text || this.peek().kind}'`, this.peek());
          this.synchronize();
        }
      }
    }
  }

  private parseQualifiedName(): string {
    let name = this.parseIdentifierName();

    while (this.check(TokenKind.COLONCOLON)) {
      // Only consume :: if followed by a name (not *)
      const nextAfterColon = this.lookAhead(1);
      if (
        nextAfterColon &&
        (nextAfterColon.kind === TokenKind.IDENTIFIER ||
          nextAfterColon.kind === TokenKind.STAR ||
          KEYWORDS_AS_IDENT.has(nextAfterColon.kind))
      ) {
        // Only consume :: + name if it's not ::* (wildcard handled by caller)
        if (nextAfterColon.kind === TokenKind.STAR) {
          break;
        }
        this.advance(); // consume ::
        name += '::' + this.parseIdentifierName();
      } else {
        break;
      }
    }

    return name;
  }

  private parseIdentifierName(): string {
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

  private parseMultiplicity(): MultiplicityNode | undefined {
    if (!this.check(TokenKind.LBRACKET)) {
      return undefined;
    }
    this.advance(); // [

    const node: MultiplicityNode = {
      $type: 'Multiplicity',
      $id: makeId(),
    };

    if (this.check(TokenKind.STAR)) {
      this.advance();
      node.upper = '*';
    } else if (this.check(TokenKind.INTEGER)) {
      const lower = parseInt(this.advance().text, 10);
      if (this.match(TokenKind.DOTDOT)) {
        node.lower = lower;
        if (this.check(TokenKind.STAR)) {
          this.advance();
          node.upper = '*';
        } else if (this.check(TokenKind.INTEGER)) {
          node.upper = parseInt(this.advance().text, 10);
        }
      } else {
        // Single value — both lower and upper
        node.lower = lower;
        node.upper = lower;
      }
    }

    this.expect(TokenKind.RBRACKET);
    return node;
  }

  private parseExpression(): ExpressionNode | undefined {
    return this.parseLiteral();
  }

  private parseLiteral(): ExpressionNode | undefined {
    const token = this.peek();

    switch (token.kind) {
      case TokenKind.INTEGER: {
        this.advance();
        return {
          $type: 'LiteralInteger',
          $id: makeId(),
          value: parseInt(token.text, 10),
        } as unknown as ExpressionNode;
      }
      case TokenKind.REAL: {
        this.advance();
        return {
          $type: 'LiteralReal',
          $id: makeId(),
          value: parseFloat(token.text),
        } as unknown as ExpressionNode;
      }
      case TokenKind.STRING: {
        this.advance();
        return {
          $type: 'LiteralString',
          $id: makeId(),
          value: token.text.slice(1, -1),
        } as unknown as ExpressionNode;
      }
      case TokenKind.TRUE: {
        this.advance();
        return {
          $type: 'LiteralBoolean',
          $id: makeId(),
          value: true,
        } as unknown as ExpressionNode;
      }
      case TokenKind.FALSE: {
        this.advance();
        return {
          $type: 'LiteralBoolean',
          $id: makeId(),
          value: false,
        } as unknown as ExpressionNode;
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
          } as ExpressionNode;
        }
        return undefined;
    }
  }

  // ── Error recovery ──

  private reportError(message: string, token?: Token): void {
    const t = token ?? this.peek();
    this.errors.push({
      message,
      line: t.line,
      column: t.column,
      offset: t.offset,
      length: t.length || 1,
    });
  }

  private synchronize(): void {
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

  private skipBody(): void {
    let depth = 1;
    while (!this.check(TokenKind.EOF) && depth > 0) {
      if (this.check(TokenKind.LBRACE)) {
        depth++;
      } else if (this.check(TokenKind.RBRACE)) {
        depth--;
        if (depth === 0) return;
      }
      this.advance();
    }
  }

  private wrapInMembership(element: AstNode): MembershipNode {
    const name = (element as { name?: string }).name;
    return {
      $type: 'Membership',
      $id: makeId(),
      memberName: name,
      memberElement: element,
    };
  }

  private lookAhead(offset: number): Token | undefined {
    const idx = this.pos + offset;
    return idx < this.tokens.length ? this.tokens[idx] : undefined;
  }
}

/** Token kinds that can be used as identifiers in name position */
const KEYWORDS_AS_IDENT = new Set<TokenKind>([
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
