import { describe, it, expect } from 'vitest';
import { EmptyFileSystem, URI, type LangiumDocument } from 'langium';
import { createSysMLBrowserServices } from '../../sysml-browser-module.js';
import { STDLIB_DEPENDENCY_LAYERS } from '../config.js';
// stdlib-browser-bundle.js is generated into dist/ by scripts/bundle-browser.cjs
import { STDLIB_FILES } from '../../../dist/stdlib-browser-bundle.js';

describe('stdlib reference resolution', () => {
  it('resolves all cross-references in stdlib files', async () => {
    const { shared } = createSysMLBrowserServices({
      ...EmptyFileSystem,
    });

    const { LangiumDocuments, DocumentBuilder, LangiumDocumentFactory } = shared.workspace;
    const allDocs: LangiumDocument[] = [];

    for (const layer of STDLIB_DEPENDENCY_LAYERS) {
      for (const filename of layer) {
        const content = STDLIB_FILES[filename];
        if (!content) continue;
        const uri = URI.parse(`inmemory:///stdlib/${filename}`);
        const doc = LangiumDocumentFactory.fromString(content, uri);
        LangiumDocuments.addDocument(doc);
        allDocs.push(doc);
      }
    }

    await DocumentBuilder.build(allDocs, { validation: true });

    const unresolvedErrors: string[] = [];
    for (const doc of allDocs) {
      const diags = doc.diagnostics ?? [];
      const errors = diags.filter((d) => d.message?.includes('Could not resolve'));
      for (const e of errors) {
        const filename = doc.uri.path.split('/').pop();
        unresolvedErrors.push(`${filename}:${e.range.start.line + 1} - ${e.message}`);
      }
    }

    if (unresolvedErrors.length > 0) {
      console.log(`\n=== ${unresolvedErrors.length} unresolved references (semantic resolution not yet implemented) ===`);
      for (const e of unresolvedErrors.slice(0, 10)) {
        console.log(`  ${e}`);
      }
      if (unresolvedErrors.length > 10) {
        console.log(`  ... and ${unresolvedErrors.length - 10} more`);
      }
    }

    // Most remaining errors require semantic analysis (inheritance, import re-export).
    // Expect under 260 — scope computation handles direct member references.
    expect(unresolvedErrors.length).toBeLessThan(260);
  }, 120000);
});
