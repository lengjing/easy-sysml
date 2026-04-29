import { URI, type LangiumDocument } from 'langium';

export const STDLIB_URI_SCHEME = 'stdlib';

export interface StdlibDocument extends LangiumDocument {
  isStandard?: boolean;
}

export function getStdlibDocumentUri(filename: string): URI {
  const normalizedPath = filename.startsWith('/') ? filename : `/${filename}`;
  return URI.from({
    scheme: STDLIB_URI_SCHEME,
    path: normalizedPath,
  });
}

export function isStandardLibraryUri(uri: URI): boolean {
  return uri.scheme === STDLIB_URI_SCHEME;
}

export function markStandardLibraryDocument<T extends LangiumDocument>(document: T): T & StdlibDocument {
  (document as StdlibDocument).isStandard = true;
  return document as T & StdlibDocument;
}

export function isStandardLibraryDocument(document: LangiumDocument): boolean {
  return isStandardLibraryUri(document.uri) || (document as StdlibDocument).isStandard === true;
}