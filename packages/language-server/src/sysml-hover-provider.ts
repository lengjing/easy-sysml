/**
 * SysML Hover Provider
 *
 * Provides hover information for SysML elements with fallback
 * when cross-references are not yet indexed.
 */

import type { AstNode, MaybePromise } from 'langium';
import { CstUtils } from 'langium';
import type { LangiumServices } from 'langium/lsp';
import type { Hover, HoverParams } from 'vscode-languageserver';
import { AstNodeHoverProvider } from 'langium/lsp';

/* eslint-disable @typescript-eslint/no-explicit-any */

export class SysMLHoverProvider extends AstNodeHoverProvider {
  constructor(services: LangiumServices) {
    super(services);
  }

  override async getHoverContent(document: any, params: HoverParams): Promise<Hover | undefined> {
    try {
      return this.getFallbackHover(document, params);
    } catch {
      return undefined;
    }
  }

  protected override getAstNodeHoverContent(node: AstNode): MaybePromise<string | undefined> {
    return this.getMarkdown(node);
  }

  private getFallbackHover(document: any, params: HoverParams): Hover | undefined {
    const rootCst = document.parseResult?.value?.$cstNode;
    if (!rootCst) return undefined;

    const offset = document.textDocument.offsetAt(params.position);
    const cstNode = CstUtils.findLeafNodeAtOffset(rootCst, offset);
    if (!cstNode?.astNode) return undefined;

    const md = this.getMarkdown(cstNode.astNode);
    if (!md) return undefined;
    return { contents: { kind: 'markdown', value: md } };
  }

  private getMarkdown(node: AstNode): string | undefined {
    const nodeType = node.$type || 'Unknown';
    const name = this.getNodeName(node);
    const lines: string[] = [];

    if (name) {
      lines.push(`**${name}**`, '');
    }
    lines.push(`*Type:* ${nodeType}`);

    const n = node as any;
    const info: string[] = [];
    if (n.visibility) info.push(`Visibility: ${n.visibility}`);
    if (n.isAbstract) info.push('Abstract');
    if (n.isSufficient) info.push('Sufficient');

    const container = node.$container;
    if (container) {
      const containerName = this.getNodeName(container);
      if (containerName) info.push(`Container: ${containerName} (${container.$type})`);
    }

    if (info.length > 0) {
      lines.push('', info.join(' • '));
    }

    return lines.join('\n');
  }

  private getNodeName(node: AstNode): string | undefined {
    const n = node as any;
    for (const prop of ['declaredName', 'name', 'shortName']) {
      if (typeof n[prop] === 'string' && n[prop].length > 0) {
        return n[prop];
      }
    }
    return undefined;
  }
}
