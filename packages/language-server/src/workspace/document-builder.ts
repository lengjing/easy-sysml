/**
 * SysML Document Builder
 *
 * Extends Langium's DefaultDocumentBuilder to skip rebuilding
 * standard library documents when user documents change.
 * Stdlib files are immutable and fully built at startup.
 */

import { DefaultDocumentBuilder, type LangiumDocument, type LangiumSharedCoreServices } from 'langium';
import { isStandardLibraryDocument } from '../stdlib/document-identity.js';

export class SysMLDocumentBuilder extends DefaultDocumentBuilder {
  constructor(services: LangiumSharedCoreServices) {
    super(services);
  }

  protected override shouldRelink(document: LangiumDocument, changedUris: Set<string>): boolean {
    if (isStandardLibraryDocument(document)) {
      return false;
    }
    return super.shouldRelink(document, changedUris);
  }
}