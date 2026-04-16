/**
 * SysML hover provider — shows element information on mouse hover.
 *
 * Displays the element type, name, visibility, multiplicity, and
 * container context.  Falls back gracefully when cross-references
 * have not been indexed yet.
 */

import type {
  AstNode,
  MaybePromise,
} from 'langium';
import type { LangiumServices } from 'langium/lsp';
import { AstNodeHoverProvider } from 'langium/lsp';

export class SysMLHoverProvider extends AstNodeHoverProvider {
  constructor(services: LangiumServices) {
    super(services);
  }

  protected override getAstNodeHoverContent(
    node: AstNode,
  ): MaybePromise<string | undefined> {
    const parts: string[] = [];

    const type = node.$type;
    const record = node as unknown as Record<string, unknown>;
    const name =
      (record['declaredName'] as string) ??
      (record['name'] as string) ??
      '(unnamed)';

    // Header
    parts.push(`**${type}** \`${name}\``);
    parts.push('');

    // Visibility
    const visibility = record['visibility'] as string | undefined;
    if (visibility) {
      parts.push(`- **Visibility:** ${visibility}`);
    }

    // Multiplicity
    const mult = record['multiplicity'] as Record<string, unknown> | undefined;
    if (mult) {
      const lower = mult['lowerBound'] ?? '';
      const upper = mult['upperBound'] ?? '';
      if (lower || upper) {
        parts.push(`- **Multiplicity:** [${lower}..${upper}]`);
      }
    }

    // isAbstract, isVariation
    if (record['isAbstract'] === true) {
      parts.push('- **abstract**');
    }
    if (record['isVariation'] === true) {
      parts.push('- **variation**');
    }

    // Container
    const container = node.$container;
    if (container) {
      const containerRecord = container as unknown as Record<string, unknown>;
      const containerName =
        (containerRecord['declaredName'] as string) ??
        (containerRecord['name'] as string) ??
        container.$type;
      parts.push(`- **Container:** ${container.$type} \`${containerName}\``);
    }

    // Short description for specific types
    const doc = record['documentation'] as Array<Record<string, unknown>> | undefined;
    if (Array.isArray(doc) && doc.length > 0) {
      const body = doc[0]?.['body'] as string | undefined;
      if (body) {
        parts.push('');
        parts.push(`> ${body}`);
      }
    }

    return parts.join('\n');
  }
}
