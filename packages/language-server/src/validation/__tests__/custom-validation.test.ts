import { describe, expect, it } from 'vitest';
import { EmptyFileSystem, URI, type LangiumDocument } from 'langium';
import type { DefinitionParams } from 'vscode-languageserver';
import { createSysMLServices } from '../../sysml-module.js';

async function buildDocument(source: string, uri = 'inmemory:///model.sysml') {
  const { shared, SysML } = createSysMLServices({
    ...EmptyFileSystem,
  });

  const { LangiumDocuments, LangiumDocumentFactory, DocumentBuilder } = shared.workspace;
  const document = LangiumDocumentFactory.fromString(source, URI.parse(uri));
  LangiumDocuments.addDocument(document);
  await DocumentBuilder.build([document as LangiumDocument], { validation: true });

  return {
    document,
    definitionProvider: (SysML as any).lsp.DefinitionProvider,
  };
}

describe('custom SysML validation', () => {
  it('reports duplicate package names in the same namespace', async () => {
    const { document } = await buildDocument(`
      package Shared;
      package Shared;
    `);

    const messages = (document.diagnostics ?? []).map((diagnostic) => diagnostic.message);
    expect(messages).toContain("Duplicate member identifier 'Shared' in the same namespace.");
  });

  it('reports duplicate identifiers across different member kinds in the same namespace', async () => {
    const { document } = await buildDocument(`
      package Shared;
      part def Shared;
    `);

    const messages = (document.diagnostics ?? []).map((diagnostic) => diagnostic.message);
    expect(messages).toContain("Duplicate member identifier 'Shared' in the same namespace.");
  });

  it('does not treat alias members as duplicate namespace identifiers', async () => {
    const { document } = await buildDocument(`
      package Demo {
        part def Foo;
        alias Foo for Foo;
      }
    `);

    const messages = (document.diagnostics ?? []).map((diagnostic) => diagnostic.message);
    expect(messages).not.toContain("Duplicate member identifier 'Foo' in the same namespace.");
  });

  it('reports bare namespace features such as `asdf {}`', async () => {
    const { document } = await buildDocument('asdf {}');

    const messages = (document.diagnostics ?? []).map((diagnostic) => diagnostic.message);
    expect(messages).toContain(
      "Unknown declaration 'asdf'. Use an explicit keyword such as 'package', 'part', or 'feature'.",
    );
  });
});

describe('custom SysML definition provider', () => {
  it('falls back to the declaration itself when go to definition is invoked on a declaration name', async () => {
    const source = 'asdf {}';
    const { document, definitionProvider } = await buildDocument(source);
    const offset = source.indexOf('asdf') + 1;
    const params: DefinitionParams = {
      textDocument: { uri: document.textDocument.uri },
      position: document.textDocument.positionAt(offset),
    };

    const links = await definitionProvider.getDefinition(document, params);

    expect(links).toHaveLength(1);
    expect(links?.[0]?.targetUri).toBe(document.textDocument.uri);
    expect(links?.[0]?.targetSelectionRange.start.character).toBe(0);
    expect(links?.[0]?.targetSelectionRange.end.character).toBe(4);
  });
});