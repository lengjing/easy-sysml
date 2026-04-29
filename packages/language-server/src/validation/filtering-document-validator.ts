/**
 * Filtering Document Validator
 *
 * Extends Langium's DefaultDocumentValidator to:
 * - Skip validation for stdlib documents
 * - Filter cascade errors for better UX
 */

import { DefaultDocumentValidator, type AstNode, type ValidationAcceptor } from 'langium';
import type { LangiumDocument, ValidationOptions, LangiumCoreServices } from 'langium';
import type { Diagnostic } from 'vscode-languageserver';
import { filterDiagnostics } from './diagnostic-filter.js';
import { isStandardLibraryDocument } from '../stdlib/document-identity.js';
import {
  validateBareNamespaceFeatures,
  validateDuplicateNamespaceMemberIdentifiers,
} from './namespace-member-rules.js';

export class FilteringDocumentValidator extends DefaultDocumentValidator {
  private readonly filteringEnabled: boolean;

  constructor(services: LangiumCoreServices) {
    super(services);
    const disableFiltering =
      typeof process !== 'undefined' &&
      typeof process.env !== 'undefined' &&
      process.env['SYSML_DISABLE_CASCADE_FILTERING'] === 'true';
    this.filteringEnabled = !disableFiltering;
  }

  protected override async validateAstAfter(
    rootNode: AstNode,
    _options: ValidationOptions,
    accept: ValidationAcceptor,
  ): Promise<void> {
    await super.validateAstAfter(rootNode, _options, accept);
    validateDuplicateNamespaceMemberIdentifiers(rootNode, accept);
    validateBareNamespaceFeatures(rootNode, accept);
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
