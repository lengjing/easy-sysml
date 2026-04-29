import { describe, expect, it } from 'vitest';
import { EmptyFileSystem, URI, type LangiumDocument } from 'langium';
import {
  STDLIB_URI_SCHEME,
  getStdlibDocumentUri,
  isStandardLibraryDocument,
  isStandardLibraryUri,
  markStandardLibraryDocument,
} from '../document-identity.js';
import { createSysMLBrowserServices } from '../../sysml-browser-module.js';

function createDocument(uri = 'inmemory:///model.sysml') {
  const { shared } = createSysMLBrowserServices({
    ...EmptyFileSystem,
  });

  return shared.workspace.LangiumDocumentFactory.fromString('package Demo;', URI.parse(uri)) as LangiumDocument;
}

describe('stdlib document identity', () => {
  it('creates stdlib URIs with the shared stdlib scheme', () => {
    const uri = getStdlibDocumentUri('Base.kerml');

    expect(uri.scheme).toBe(STDLIB_URI_SCHEME);
    expect(uri.path).toBe('/Base.kerml');
    expect(isStandardLibraryUri(uri)).toBe(true);
  });

  it('detects stdlib documents from their URI alone', () => {
    const document = createDocument(getStdlibDocumentUri('Kernel.sysml').toString());

    expect(isStandardLibraryDocument(document)).toBe(true);
  });

  it('preserves explicit standard-library marking for non-stdlib URIs', () => {
    const document = createDocument();

    expect(isStandardLibraryDocument(document)).toBe(false);

    markStandardLibraryDocument(document);

    expect(isStandardLibraryDocument(document)).toBe(true);
  });
});