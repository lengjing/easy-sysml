// ---------------------------------------------------------------------------
// Recursive descent parser for SysML v2
// ---------------------------------------------------------------------------

import type { Range, Position, Diagnostic } from '@easy-sysml/protocol';
import { DiagnosticSeverity, SysMLElementKind, VisibilityKind } from '@easy-sysml/protocol';
import type {
  ASTNode,
  PackageNode,
  DefinitionNode,
  UsageNode,
  CommentNode,
  ImportNode,
} from '@easy-sysml/ast';
import {
  createPackage,
  createDefinition,
  createUsage,
  createComment,
  createImport,
  createNode,
  resetAnonymousCounter,
} from '@easy-sysml/ast';
import { addChild } from '@easy-sysml/ast';

import type { Token } from './lexer.js';
import { TokenKind } from './lexer.js';
import { ParseError, ErrorCode, ErrorRecovery } from './parse-error.js';

// ---------------------------------------------------------------------------
// Result type
// ---------------------------------------------------------------------------

export interface ParseResult {
  readonly ast: ASTNode;
  readonly diagnostics: Diagnostic[];
}

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

export class Parser {
  private tokens: Token[] = [];
  private pos = 0;
  private diagnostics: Diagnostic[] = [];
  private uri = '';

  /**
   * Parse a stream of tokens into an AST.
   *
   * @param tokens - Token stream produced by the {@link Lexer}.
   * @param uri    - Optional document URI attached to diagnostics.
   */
  parse(tokens: Token[], uri?: string): ParseResult {
    this.tokens = tokens;
    this.pos = 0;
    this.diagnostics = [];
    this.uri = uri ?? '';
    resetAnonymousCounter();

    const root = this.parseRoot();
    return { ast: root, diagnostics: this.diagnostics };
  }

  // -----------------------------------------------------------------------
  // Root – a synthetic Namespace node wrapping top-level members
  // -----------------------------------------------------------------------

  private parseRoot(): PackageNode {
    const start = this.currentRange().start;

    const root = createPackage('$root', this.makeRange(start, start));
    root.visibility = VisibilityKind.Public;

    while (!this.isAtEnd()) {
      this.skipTrivia();
      if (this.isAtEnd()) break;

      const member = this.parseMember(root);
      if (member) {
        addChild(root, member);
        (root as PackageNode).members.push(member);
        if (member.kind === SysMLElementKind.Import) {
          (root as PackageNode).imports.push(member as ImportNode);
        }
      }
    }

    root.range = this.makeRange(start, this.currentRange().end);
    return root;
  }

  // -----------------------------------------------------------------------
  // Member dispatch
  // -----------------------------------------------------------------------

  private parseMember(parent: ASTNode): ASTNode | null {
    this.skipTrivia();
    if (this.isAtEnd()) return null;

    const visibility = this.tryParseVisibility();
    const isAbstract = this.tryConsumeKeyword(TokenKind.Abstract);

    const tok = this.current();
    switch (tok.kind) {
      case TokenKind.Package:
        return this.parsePackageDeclaration(parent, visibility);
      case TokenKind.Part:
        return this.parsePartOrDef(parent, visibility, isAbstract);
      case TokenKind.Attribute:
        return this.parseAttributeOrDef(parent, visibility, isAbstract);
      case TokenKind.Port:
        return this.parsePortOrDef(parent, visibility, isAbstract);
      case TokenKind.Action:
        return this.parseActionOrDef(parent, visibility, isAbstract);
      case TokenKind.State:
        return this.parseStateOrDef(parent, visibility, isAbstract);
      case TokenKind.Requirement:
        return this.parseRequirementOrDef(parent, visibility, isAbstract);
      case TokenKind.Connection:
        return this.parseConnectionOrDef(parent, visibility, isAbstract);
      case TokenKind.Interface:
        return this.parseInterfaceOrDef(parent, visibility, isAbstract);
      case TokenKind.Item:
        return this.parseItemOrDef(parent, visibility, isAbstract);
      case TokenKind.Flow:
        return this.parseFlowOrDef(parent, visibility, isAbstract);
      case TokenKind.Enum:
        return this.parseEnumDef(parent, visibility, isAbstract);
      case TokenKind.Constraint:
        return this.parseConstraintOrDef(parent, visibility, isAbstract);
      case TokenKind.Import:
        return this.parseImport(parent, visibility);
      case TokenKind.Comment:
        return this.parseCommentDecl(parent);
      case TokenKind.Doc:
        return this.parseDocComment(parent);
      case TokenKind.Metadata:
        return this.parseMetadata(parent, visibility);
      default:
        // Error recovery: skip to next sync point
        this.addDiagnostic(
          tok.range,
          ErrorRecovery.expectedMessage('a declaration', tok.text),
          ErrorCode.InvalidMember,
        );
        this.skipToSync();
        return null;
    }
  }

  // -----------------------------------------------------------------------
  // Package
  // -----------------------------------------------------------------------

  private parsePackageDeclaration(
    parent: ASTNode,
    visibility?: VisibilityKind,
  ): PackageNode {
    const start = this.current().range.start;
    this.expect(TokenKind.Package); // consume 'package'

    const name = this.expectIdentifier();
    const pkg = createPackage(name, this.makeRange(start, start), {
      parent,
      visibility,
    });

    this.skipTrivia();
    if (this.check(TokenKind.LBrace)) {
      this.parseBody(pkg, (p) => {
        const member = this.parseMember(p);
        if (member) {
          addChild(p, member);
          (p as PackageNode).members.push(member);
          if (member.kind === SysMLElementKind.Import) {
            (p as PackageNode).imports.push(member as ImportNode);
          }
        }
      });
    } else {
      this.expectSemicolon();
    }

    pkg.range = this.makeRange(start, this.previousRange().end);
    return pkg;
  }

  // -----------------------------------------------------------------------
  // Definition / Usage helpers
  // -----------------------------------------------------------------------

  private parseDefinitionOrUsage(
    parent: ASTNode,
    keyword: TokenKind,
    defKind: SysMLElementKind,
    usageKind: SysMLElementKind,
    visibility?: VisibilityKind,
    isAbstract?: boolean,
  ): DefinitionNode | UsageNode {
    const start = this.current().range.start;
    this.expect(keyword);

    this.skipTrivia();
    const isDef = this.tryConsumeKeyword(TokenKind.Def);

    const name = this.expectIdentifier();

    if (isDef) {
      return this.finishDefinition(defKind, name, start, parent, visibility, isAbstract);
    }
    return this.finishUsage(usageKind, name, start, parent, visibility, isAbstract);
  }

  private finishDefinition(
    kind: SysMLElementKind,
    name: string,
    start: Position,
    parent: ASTNode,
    visibility?: VisibilityKind,
    isAbstract?: boolean,
  ): DefinitionNode {
    const def = createDefinition(kind, name, this.makeRange(start, start), {
      parent,
      visibility,
      properties: isAbstract ? { isAbstract: true } : undefined,
    });

    this.skipTrivia();

    // Specialization clauses
    this.parseSpecializationClauses(def);

    this.skipTrivia();
    if (this.check(TokenKind.LBrace)) {
      this.parseBody(def, (d) => {
        const member = this.parseMember(d);
        if (member) {
          addChild(d, member);
          (d as DefinitionNode).ownedFeatures.push(member);
        }
      });
    } else {
      this.expectSemicolon();
    }

    def.range = this.makeRange(start, this.previousRange().end);
    return def;
  }

  private finishUsage(
    kind: SysMLElementKind,
    name: string,
    start: Position,
    parent: ASTNode,
    visibility?: VisibilityKind,
    _isAbstract?: boolean,
  ): UsageNode {
    const usage = createUsage(kind, name, this.makeRange(start, start), {
      parent,
      visibility,
    });

    this.skipTrivia();

    // Multiplicity
    if (this.check(TokenKind.LBracket)) {
      this.parseMultiplicity(usage);
    }

    this.skipTrivia();

    // Feature typing  : Type
    if (this.check(TokenKind.Colon) && !this.checkAt(1, TokenKind.Colon) && !this.checkAt(1, TokenKind.RAngle)) {
      this.advance(); // consume ':'
      this.skipTrivia();
      const typeName = this.parseQualifiedName();
      usage.typings.push(typeName);
    }

    // :> (subsetting shorthand)
    if (this.check(TokenKind.ColonGt)) {
      this.advance();
      this.skipTrivia();
      const subsetName = this.parseQualifiedName();
      usage.subsettings.push(subsetName);
    }

    // :>> (redefinition shorthand)
    if (this.check(TokenKind.ColonGtGt)) {
      this.advance();
      this.skipTrivia();
      const redefName = this.parseQualifiedName();
      usage.redefinitions.push(redefName);
    }

    // Keyword relationships
    this.parseUsageRelationships(usage);

    this.skipTrivia();
    if (this.check(TokenKind.LBrace)) {
      this.parseBody(usage, (u) => {
        const member = this.parseMember(u);
        if (member) {
          addChild(u, member);
        }
      });
    } else {
      this.expectSemicolon();
    }

    usage.range = this.makeRange(start, this.previousRange().end);
    return usage;
  }

  // -----------------------------------------------------------------------
  // Keyword-specific parsers (delegate to generic)
  // -----------------------------------------------------------------------

  private parsePartOrDef(
    parent: ASTNode,
    visibility?: VisibilityKind,
    isAbstract?: boolean,
  ): DefinitionNode | UsageNode {
    return this.parseDefinitionOrUsage(
      parent, TokenKind.Part,
      SysMLElementKind.PartDefinition, SysMLElementKind.PartUsage,
      visibility, isAbstract,
    );
  }

  private parseAttributeOrDef(
    parent: ASTNode,
    visibility?: VisibilityKind,
    isAbstract?: boolean,
  ): DefinitionNode | UsageNode {
    return this.parseDefinitionOrUsage(
      parent, TokenKind.Attribute,
      SysMLElementKind.AttributeDefinition, SysMLElementKind.AttributeUsage,
      visibility, isAbstract,
    );
  }

  private parsePortOrDef(
    parent: ASTNode,
    visibility?: VisibilityKind,
    isAbstract?: boolean,
  ): DefinitionNode | UsageNode {
    // Check for direction prefix before port keyword has been consumed
    return this.parseDefinitionOrUsage(
      parent, TokenKind.Port,
      SysMLElementKind.PortDefinition, SysMLElementKind.PortUsage,
      visibility, isAbstract,
    );
  }

  private parseActionOrDef(
    parent: ASTNode,
    visibility?: VisibilityKind,
    isAbstract?: boolean,
  ): DefinitionNode | UsageNode {
    return this.parseDefinitionOrUsage(
      parent, TokenKind.Action,
      SysMLElementKind.ActionDefinition, SysMLElementKind.ActionUsage,
      visibility, isAbstract,
    );
  }

  private parseStateOrDef(
    parent: ASTNode,
    visibility?: VisibilityKind,
    isAbstract?: boolean,
  ): DefinitionNode | UsageNode {
    return this.parseDefinitionOrUsage(
      parent, TokenKind.State,
      SysMLElementKind.StateDefinition, SysMLElementKind.StateUsage,
      visibility, isAbstract,
    );
  }

  private parseRequirementOrDef(
    parent: ASTNode,
    visibility?: VisibilityKind,
    isAbstract?: boolean,
  ): DefinitionNode | UsageNode {
    return this.parseDefinitionOrUsage(
      parent, TokenKind.Requirement,
      SysMLElementKind.RequirementDefinition, SysMLElementKind.RequirementUsage,
      visibility, isAbstract,
    );
  }

  private parseConnectionOrDef(
    parent: ASTNode,
    visibility?: VisibilityKind,
    isAbstract?: boolean,
  ): DefinitionNode | UsageNode {
    return this.parseDefinitionOrUsage(
      parent, TokenKind.Connection,
      SysMLElementKind.ConnectionDefinition, SysMLElementKind.ConnectionUsage,
      visibility, isAbstract,
    );
  }

  private parseInterfaceOrDef(
    parent: ASTNode,
    visibility?: VisibilityKind,
    isAbstract?: boolean,
  ): DefinitionNode | UsageNode {
    return this.parseDefinitionOrUsage(
      parent, TokenKind.Interface,
      SysMLElementKind.InterfaceDefinition, SysMLElementKind.InterfaceUsage,
      visibility, isAbstract,
    );
  }

  private parseItemOrDef(
    parent: ASTNode,
    visibility?: VisibilityKind,
    isAbstract?: boolean,
  ): DefinitionNode | UsageNode {
    return this.parseDefinitionOrUsage(
      parent, TokenKind.Item,
      SysMLElementKind.ItemDefinition, SysMLElementKind.ItemUsage,
      visibility, isAbstract,
    );
  }

  private parseFlowOrDef(
    parent: ASTNode,
    visibility?: VisibilityKind,
    isAbstract?: boolean,
  ): DefinitionNode | UsageNode {
    return this.parseDefinitionOrUsage(
      parent, TokenKind.Flow,
      SysMLElementKind.FlowConnectionDefinition, SysMLElementKind.FlowConnectionUsage,
      visibility, isAbstract,
    );
  }

  private parseEnumDef(
    parent: ASTNode,
    visibility?: VisibilityKind,
    isAbstract?: boolean,
  ): DefinitionNode {
    const start = this.current().range.start;
    this.expect(TokenKind.Enum);

    this.skipTrivia();
    // enum always expects 'def'
    const hasDef = this.tryConsumeKeyword(TokenKind.Def);
    if (!hasDef) {
      this.addDiagnostic(
        this.currentRange(),
        ErrorRecovery.expectedMessage("'def'", this.current().text),
        ErrorCode.ExpectedToken,
      );
    }

    const name = this.expectIdentifier();
    return this.finishDefinition(
      SysMLElementKind.Enumeration, name, start, parent, visibility, isAbstract,
    );
  }

  private parseConstraintOrDef(
    parent: ASTNode,
    visibility?: VisibilityKind,
    isAbstract?: boolean,
  ): DefinitionNode | UsageNode {
    return this.parseDefinitionOrUsage(
      parent, TokenKind.Constraint,
      SysMLElementKind.Constraint, SysMLElementKind.Constraint,
      visibility, isAbstract,
    );
  }

  // -----------------------------------------------------------------------
  // Import
  // -----------------------------------------------------------------------

  private parseImport(
    parent: ASTNode,
    visibility?: VisibilityKind,
  ): ImportNode {
    const start = this.current().range.start;
    this.expect(TokenKind.Import);

    this.skipTrivia();
    let namespace = this.parseQualifiedName();
    let isWildcard = false;

    this.skipTrivia();
    // ::*
    if (this.check(TokenKind.ColonColon)) {
      this.advance();
      this.skipTrivia();
      if (this.check(TokenKind.Star)) {
        this.advance();
        isWildcard = true;
        namespace += '::*';
      }
    }

    this.expectSemicolon();

    const imp = createImport(namespace, this.makeRange(start, this.previousRange().end), false, isWildcard, {
      parent,
      visibility,
    });
    return imp;
  }

  // -----------------------------------------------------------------------
  // Comment / doc
  // -----------------------------------------------------------------------

  private parseCommentDecl(parent: ASTNode): CommentNode {
    const start = this.current().range.start;
    this.expect(TokenKind.Comment);

    this.skipTrivia();
    let annotatedElement: string | undefined;

    if (this.check(TokenKind.About)) {
      this.advance();
      this.skipTrivia();
      annotatedElement = this.expectIdentifier();
    }

    this.skipTrivia();
    let body = '';
    if (this.check(TokenKind.BlockComment)) {
      const tok = this.current();
      body = tok.text.slice(2, -2).trim(); // strip /* */
      this.advance();
    } else if (this.check(TokenKind.StringLiteral)) {
      body = this.parseStringValue();
    } else {
      this.expectSemicolon();
    }

    const comment = createComment(body, this.makeRange(start, this.previousRange().end), { parent });
    if (annotatedElement) {
      (comment as CommentNode & { annotatedElement?: string }).annotatedElement = annotatedElement;
    }
    return comment;
  }

  private parseDocComment(parent: ASTNode): CommentNode {
    const start = this.current().range.start;
    this.expect(TokenKind.Doc);

    this.skipTrivia();
    let body = '';
    if (this.check(TokenKind.BlockComment)) {
      const tok = this.current();
      body = tok.text.slice(2, -2).trim();
      this.advance();
    } else if (this.check(TokenKind.StringLiteral)) {
      body = this.parseStringValue();
    } else {
      this.expectSemicolon();
    }

    const doc = createNode(
      SysMLElementKind.Documentation,
      undefined,
      this.makeRange(start, this.previousRange().end),
      { parent },
    );
    (doc as unknown as CommentNode).body = body;
    return doc as unknown as CommentNode;
  }

  // -----------------------------------------------------------------------
  // Metadata
  // -----------------------------------------------------------------------

  private parseMetadata(
    parent: ASTNode,
    visibility?: VisibilityKind,
  ): ASTNode {
    const start = this.current().range.start;
    this.expect(TokenKind.Metadata);

    this.skipTrivia();
    // Optional 'def'
    const isDef = this.tryConsumeKeyword(TokenKind.Def);
    const name = this.expectIdentifier();

    const node = createNode(
      isDef ? SysMLElementKind.MetadataFeature : SysMLElementKind.AnnotatingElement,
      name,
      this.makeRange(start, start),
      { parent, visibility },
    );

    this.skipTrivia();
    if (this.check(TokenKind.LBrace)) {
      this.parseBody(node, (n) => {
        const member = this.parseMember(n);
        if (member) addChild(n, member);
      });
    } else {
      this.expectSemicolon();
    }

    node.range = this.makeRange(start, this.previousRange().end);
    return node;
  }

  // -----------------------------------------------------------------------
  // Specialization clauses
  // -----------------------------------------------------------------------

  private parseSpecializationClauses(def: DefinitionNode): void {
    this.skipTrivia();

    while (!this.isAtEnd()) {
      if (this.check(TokenKind.Specializes) || this.check(TokenKind.ColonGt)) {
        this.advance();
        this.skipTrivia();
        const baseName = this.parseQualifiedName();
        def.specializations.push(baseName);
        this.skipTrivia();

        // Handle comma-separated list
        while (this.check(TokenKind.Comma)) {
          this.advance();
          this.skipTrivia();
          def.specializations.push(this.parseQualifiedName());
          this.skipTrivia();
        }
      } else {
        break;
      }
    }
  }

  private parseUsageRelationships(usage: UsageNode): void {
    this.skipTrivia();
    while (!this.isAtEnd()) {
      if (this.check(TokenKind.Subsets)) {
        this.advance();
        this.skipTrivia();
        usage.subsettings.push(this.parseQualifiedName());
        this.skipTrivia();
      } else if (this.check(TokenKind.Redefines)) {
        this.advance();
        this.skipTrivia();
        usage.redefinitions.push(this.parseQualifiedName());
        this.skipTrivia();
      } else if (this.check(TokenKind.Specializes) || this.check(TokenKind.ColonGt)) {
        this.advance();
        this.skipTrivia();
        usage.typings.push(this.parseQualifiedName());
        this.skipTrivia();
      } else {
        break;
      }
    }
  }

  // -----------------------------------------------------------------------
  // Multiplicity  [lower..upper]  [*]  [n]
  // -----------------------------------------------------------------------

  private parseMultiplicity(usage: UsageNode): void {
    this.expect(TokenKind.LBracket);
    this.skipTrivia();

    let lower: number | undefined;
    let upper: number | '*' | undefined;

    if (this.check(TokenKind.Star)) {
      upper = '*';
      this.advance();
    } else if (this.check(TokenKind.IntegerLiteral)) {
      const first = parseInt(this.current().text, 10);
      this.advance();
      this.skipTrivia();

      if (this.check(TokenKind.DotDot)) {
        this.advance();
        this.skipTrivia();
        lower = first;

        if (this.check(TokenKind.Star)) {
          upper = '*';
          this.advance();
        } else if (this.check(TokenKind.IntegerLiteral)) {
          upper = parseInt(this.current().text, 10);
          this.advance();
        } else {
          this.addDiagnostic(
            this.currentRange(),
            ErrorRecovery.expectedMessage('upper bound', this.current().text),
            ErrorCode.InvalidMultiplicity,
          );
        }
      } else {
        // single value: [n] means exactly n
        lower = first;
        upper = first;
      }
    }

    this.skipTrivia();
    this.expect(TokenKind.RBracket);

    const range = this.makeRange(
      usage.range.start,
      this.previousRange().end,
    );

    const multNode = createNode(
      SysMLElementKind.Multiplicity,
      undefined,
      range,
    ) as ASTNode & { lower?: number; upper?: number | '*' };
    multNode.lower = lower;
    multNode.upper = upper;
    usage.multiplicity = multNode as import('@easy-sysml/ast').MultiplicityNode;
  }

  // -----------------------------------------------------------------------
  // Brace-delimited body
  // -----------------------------------------------------------------------

  private parseBody<T extends ASTNode>(
    parent: T,
    parseChild: (parent: T) => void,
  ): void {
    this.expect(TokenKind.LBrace);

    while (!this.isAtEnd() && !this.check(TokenKind.RBrace)) {
      this.skipTrivia();
      if (this.isAtEnd() || this.check(TokenKind.RBrace)) break;

      const posBefore = this.pos;
      parseChild(parent);

      // Safety: if no progress, skip one token to avoid infinite loops
      if (this.pos === posBefore) {
        this.advance();
      }
    }

    if (this.check(TokenKind.RBrace)) {
      this.advance();
    } else {
      this.addDiagnostic(
        this.currentRange(),
        ErrorRecovery.expectedMessage("'}'", this.isAtEnd() ? 'EOF' : this.current().text),
        ErrorCode.ExpectedRBrace,
      );
    }
  }

  // -----------------------------------------------------------------------
  // Qualified names (e.g.  Pkg::Sub::Name)
  // -----------------------------------------------------------------------

  private parseQualifiedName(): string {
    let name = this.expectIdentifier();
    this.skipTrivia();

    while (this.check(TokenKind.ColonColon)) {
      this.advance(); // consume ::
      this.skipTrivia();

      // Could be a wildcard import (Pkg::*)
      if (this.check(TokenKind.Star)) {
        name += '::*';
        this.advance();
        break;
      }

      name += '::' + this.expectIdentifier();
      this.skipTrivia();
    }

    return name;
  }

  // -----------------------------------------------------------------------
  // Visibility
  // -----------------------------------------------------------------------

  private tryParseVisibility(): VisibilityKind | undefined {
    this.skipTrivia();
    if (this.check(TokenKind.Public)) { this.advance(); return VisibilityKind.Public; }
    if (this.check(TokenKind.Private)) { this.advance(); return VisibilityKind.Private; }
    if (this.check(TokenKind.Protected)) { this.advance(); return VisibilityKind.Protected; }
    return undefined;
  }

  // -----------------------------------------------------------------------
  // Direction (for features)
  // -----------------------------------------------------------------------

  // reserved for future use when feature direction is attached to usages
  // private tryParseDirection(): 'in' | 'out' | 'inout' | undefined { ... }

  // -----------------------------------------------------------------------
  // String value
  // -----------------------------------------------------------------------

  private parseStringValue(): string {
    const tok = this.current();
    this.advance();
    // Strip quotes
    const raw = tok.text;
    if (raw.startsWith('"') && raw.endsWith('"')) {
      return raw.slice(1, -1);
    }
    return raw;
  }

  // -----------------------------------------------------------------------
  // Token helpers
  // -----------------------------------------------------------------------

  private current(): Token {
    return this.tokens[this.pos] ?? {
      kind: TokenKind.EOF,
      text: '',
      range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
    };
  }

  private currentRange(): Range {
    return this.current().range;
  }

  private previousRange(): Range {
    if (this.pos > 0) return this.tokens[this.pos - 1].range;
    return this.currentRange();
  }

  private isAtEnd(): boolean {
    return this.pos >= this.tokens.length || this.current().kind === TokenKind.EOF;
  }

  private check(kind: TokenKind): boolean {
    return this.current().kind === kind;
  }

  private checkAt(offset: number, kind: TokenKind): boolean {
    // Look ahead over trivia
    let idx = this.pos;
    let skip = offset;
    while (idx < this.tokens.length) {
      const tk = this.tokens[idx];
      if (tk.kind !== TokenKind.Whitespace && tk.kind !== TokenKind.LineComment && tk.kind !== TokenKind.BlockComment) {
        if (skip === 0) return tk.kind === kind;
        skip--;
      }
      idx++;
    }
    return false;
  }

  private advance(): Token {
    const tok = this.current();
    if (this.pos < this.tokens.length) this.pos++;
    return tok;
  }

  private expect(kind: TokenKind): Token {
    this.skipTrivia();
    const tok = this.current();
    if (tok.kind !== kind) {
      this.addDiagnostic(
        tok.range,
        ErrorRecovery.expectedMessage(`'${kind}'`, tok.text),
        ErrorCode.ExpectedToken,
      );
      // Don't consume – let caller decide
      return tok;
    }
    return this.advance();
  }

  private expectIdentifier(): string {
    this.skipTrivia();
    const tok = this.current();
    if (tok.kind === TokenKind.Identifier) {
      this.advance();
      return tok.text;
    }
    this.addDiagnostic(
      tok.range,
      ErrorRecovery.expectedMessage('identifier', tok.text),
      ErrorCode.ExpectedIdentifier,
    );
    return '$error';
  }

  private expectSemicolon(): void {
    this.skipTrivia();
    if (this.check(TokenKind.Semicolon)) {
      this.advance();
    } else {
      this.addDiagnostic(
        this.currentRange(),
        ErrorRecovery.expectedMessage("';'", this.current().text),
        ErrorCode.ExpectedSemicolon,
      );
    }
  }

  private tryConsumeKeyword(kind: TokenKind): boolean {
    this.skipTrivia();
    if (this.check(kind)) {
      this.advance();
      return true;
    }
    return false;
  }

  private skipTrivia(): void {
    while (
      this.pos < this.tokens.length &&
      (this.current().kind === TokenKind.Whitespace ||
        this.current().kind === TokenKind.LineComment ||
        this.current().kind === TokenKind.BlockComment)
    ) {
      this.pos++;
    }
  }

  private skipToSync(): void {
    while (!this.isAtEnd()) {
      const tok = this.current();
      if (tok.kind === TokenKind.Semicolon) { this.advance(); return; }
      if (tok.kind === TokenKind.RBrace) return;
      if (ErrorRecovery.isSyncPoint(tok.kind)) return;
      this.advance();
    }
  }

  // -----------------------------------------------------------------------
  // Range helpers
  // -----------------------------------------------------------------------

  private makeRange(start: Position, end: Position): Range {
    return { start, end };
  }

  // -----------------------------------------------------------------------
  // Diagnostics
  // -----------------------------------------------------------------------

  private addDiagnostic(range: Range, message: string, code: string): void {
    this.diagnostics.push({
      range,
      message,
      severity: DiagnosticSeverity.Error,
      code,
      source: 'sysml-parser',
    });
  }
}
