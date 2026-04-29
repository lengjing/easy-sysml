import { CstUtils, GrammarUtils, type LangiumDocument } from 'langium';
import { DefaultDefinitionProvider, type LangiumServices } from 'langium/lsp';
import { LocationLink, type DefinitionParams } from 'vscode-languageserver';
import { findNameNode } from '../ast-names.js';

export class SysMLDefinitionProvider extends DefaultDefinitionProvider {
  constructor(services: LangiumServices) {
    super(services);
  }

  override async getDefinition(
    document: LangiumDocument,
    params: DefinitionParams,
  ): Promise<LocationLink[] | undefined> {
    const links = await super.getDefinition(document, params);
    if (links && links.length > 0) {
      return links;
    }
    return this.getSelfDefinition(document, params);
  }

  private getSelfDefinition(
    document: LangiumDocument,
    params: DefinitionParams,
  ): LocationLink[] | undefined {
    const rootCst = document.parseResult.value.$cstNode;
    if (!rootCst) {
      return undefined;
    }

    const offset = document.textDocument.offsetAt(params.position);
    const leaf = CstUtils.findLeafNodeAtOffset(rootCst, offset);
    const astNode = leaf?.astNode as { $cstNode?: typeof rootCst } | undefined;
    if (!astNode?.$cstNode) {
      return undefined;
    }

    const nameNode = this.findNameNode(astNode.$cstNode, offset);
    if (!nameNode) {
      return undefined;
    }

    return [
      LocationLink.create(
        document.textDocument.uri,
        astNode.$cstNode.range,
        nameNode.range,
        nameNode.range,
      ),
    ];
  }

  private findNameNode(
    cstNode: NonNullable<LangiumDocument['parseResult']['value']['$cstNode']>,
    offset: number,
  ) {
    return findNameNode(cstNode, offset);
  }
}