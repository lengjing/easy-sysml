/**
 * SysML code-completion provider.
 *
 * Extends Langium's default completion with SysML v2 snippet templates
 * for common modeling patterns (packages, part definitions, usages, etc.).
 */

import type {
  MaybePromise,
} from 'langium';
import type { LangiumServices } from 'langium/lsp';
import {
  DefaultCompletionProvider,
  type CompletionAcceptor,
  type CompletionContext,
  type NextFeature,
} from 'langium/lsp';
import { CompletionItemKind, InsertTextFormat } from 'vscode-languageserver';

/* ------------------------------------------------------------------ */
/*  Snippet Registry                                                   */
/* ------------------------------------------------------------------ */

interface SnippetTemplate {
  label: string;
  detail: string;
  insertText: string;
  kind: CompletionItemKind;
}

const SNIPPETS: SnippetTemplate[] = [
  {
    label: 'package',
    detail: 'New SysML package',
    insertText: 'package ${1:PackageName} {\n\t$0\n}',
    kind: CompletionItemKind.Module,
  },
  {
    label: 'part def',
    detail: 'Part definition',
    insertText: 'part def ${1:PartName} {\n\t$0\n}',
    kind: CompletionItemKind.Class,
  },
  {
    label: 'part',
    detail: 'Part usage',
    insertText: 'part ${1:partName} : ${2:PartDef};',
    kind: CompletionItemKind.Variable,
  },
  {
    label: 'attribute def',
    detail: 'Attribute definition',
    insertText: 'attribute def ${1:AttrName} {\n\t$0\n}',
    kind: CompletionItemKind.Class,
  },
  {
    label: 'attribute',
    detail: 'Attribute usage',
    insertText: 'attribute ${1:attrName} : ${2:AttrDef};',
    kind: CompletionItemKind.Field,
  },
  {
    label: 'port def',
    detail: 'Port definition',
    insertText: 'port def ${1:PortName} {\n\t$0\n}',
    kind: CompletionItemKind.Interface,
  },
  {
    label: 'port',
    detail: 'Port usage',
    insertText: 'port ${1:portName} : ${2:PortDef};',
    kind: CompletionItemKind.Variable,
  },
  {
    label: 'connection def',
    detail: 'Connection definition',
    insertText: 'connection def ${1:ConnectionName} {\n\tend ${2:end1} : ${3:Part1};\n\tend ${4:end2} : ${5:Part2};\n}',
    kind: CompletionItemKind.Class,
  },
  {
    label: 'action def',
    detail: 'Action definition',
    insertText: 'action def ${1:ActionName} {\n\t$0\n}',
    kind: CompletionItemKind.Function,
  },
  {
    label: 'action',
    detail: 'Action usage',
    insertText: 'action ${1:actionName} : ${2:ActionDef};',
    kind: CompletionItemKind.Function,
  },
  {
    label: 'state def',
    detail: 'State definition',
    insertText: 'state def ${1:StateName} {\n\tentry; then ${2:state1};\n\tstate ${2:state1};\n}',
    kind: CompletionItemKind.Enum,
  },
  {
    label: 'requirement def',
    detail: 'Requirement definition',
    insertText: 'requirement def ${1:ReqName} {\n\tdoc /* ${2:description} */\n\t$0\n}',
    kind: CompletionItemKind.Event,
  },
  {
    label: 'requirement',
    detail: 'Requirement usage',
    insertText: 'requirement ${1:reqName} : ${2:ReqDef};',
    kind: CompletionItemKind.Event,
  },
  {
    label: 'item def',
    detail: 'Item definition',
    insertText: 'item def ${1:ItemName} {\n\t$0\n}',
    kind: CompletionItemKind.Class,
  },
  {
    label: 'interface def',
    detail: 'Interface definition',
    insertText: 'interface def ${1:InterfaceName} {\n\tend ${2:end1} : ${3:Port1};\n\tend ${4:end2} : ${5:Port2};\n}',
    kind: CompletionItemKind.Interface,
  },
  {
    label: 'import',
    detail: 'Import declaration',
    insertText: 'import ${1:PackageName}::*;',
    kind: CompletionItemKind.Reference,
  },
  {
    label: 'doc',
    detail: 'Documentation comment',
    insertText: 'doc /* ${1:description} */',
    kind: CompletionItemKind.Text,
  },
  {
    label: 'flow',
    detail: 'Flow connection usage',
    insertText: 'flow ${1:source}.${2:outPort} to ${3:target}.${4:inPort};',
    kind: CompletionItemKind.Reference,
  },
  {
    label: 'allocation def',
    detail: 'Allocation definition',
    insertText: 'allocation def ${1:AllocName} {\n\tend ${2:end1} : ${3:Source};\n\tend ${4:end2} : ${5:Target};\n}',
    kind: CompletionItemKind.Class,
  },
  {
    label: 'use case def',
    detail: 'Use case definition',
    insertText: 'use case def ${1:UseCaseName} {\n\tsubject ${2:subjectName} : ${3:SubjectType};\n\t$0\n}',
    kind: CompletionItemKind.Event,
  },
  {
    label: 'constraint def',
    detail: 'Constraint definition',
    insertText: 'constraint def ${1:ConstraintName} {\n\t$0\n}',
    kind: CompletionItemKind.Event,
  },
];

/* ------------------------------------------------------------------ */
/*  Provider                                                           */
/* ------------------------------------------------------------------ */

export class SysMLCompletionProvider extends DefaultCompletionProvider {
  constructor(services: LangiumServices) {
    super(services);
  }

  override completionFor(
    context: CompletionContext,
    next: NextFeature,
    acceptor: CompletionAcceptor,
  ): MaybePromise<void> {
    // Add SysML snippet completions
    this.addSnippets(context, acceptor);

    // Then add default Langium completions (keywords, cross-references)
    return super.completionFor(context, next, acceptor);
  }

  private addSnippets(
    context: CompletionContext,
    acceptor: CompletionAcceptor,
  ): void {
    for (const snippet of SNIPPETS) {
      acceptor(context, {
        label: snippet.label,
        kind: snippet.kind,
        detail: snippet.detail,
        insertText: snippet.insertText,
        insertTextFormat: InsertTextFormat.Snippet,
        sortText: `0_${snippet.label}`, // Sort snippets before keywords
      });
    }
  }
}
