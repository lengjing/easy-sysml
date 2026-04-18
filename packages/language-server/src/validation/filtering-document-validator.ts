/**
 * Filtering Document Validator
 *
 * Extends Langium's DefaultDocumentValidator to:
 * - Skip validation for stdlib documents
 * - Filter cascade errors for better UX
 */

import { DefaultDocumentValidator } from 'langium';
import type { LangiumDocument, ValidationOptions, LangiumCoreServices } from 'langium';
import type { Diagnostic } from 'vscode-languageserver';
import { filterDiagnostics } from './diagnostic-filter.js';
import { isStandardLibraryDocument } from '../stdlib/loader.js';

export class FilteringDocumentValidator extends DefaultDocumentValidator {
  private filteringEnabled: boolean;

  constructor(services: LangiumCoreServices) {
    super(services);
    this.filteringEnabled = process.env['SYSML_DISABLE_CASCADE_FILTERING'] !== 'true';
  }

  async validateDocument(
    document: LangiumDocument,
    options: ValidationOptions = {},
  ): Promise<Diagnostic[]> {
    if (isStandardLibraryDocument(document)) {
      return [];
    }

    const diagnostics = await super.validateDocument(document, options);

    return filterDiagnostics(diagnostics, {
      enableFiltering: this.filteringEnabled,
    });
  }
}
