/**
 * Browser-compatible Standard Library Loader
 *
 * Loads pre-bundled SysML/KerML stdlib files into the Langium workspace.
 * Unlike the Node.js loader in @easy-sysml/stdlib, this works entirely
 * in the browser by accepting file contents as strings.
 */

import { URI, type LangiumDocument, type LangiumSharedCoreServices } from 'langium';

/** Dependency layers — same order as @easy-sysml/stdlib/config */
const STDLIB_DEPENDENCY_LAYERS: readonly string[][] = [
  ['Base.kerml'],
  ['ScalarValues.kerml', 'VectorValues.kerml'],
  ['Collections.kerml'],
  ['Links.kerml', 'Metaobjects.kerml'],
  ['Clocks.kerml', 'Occurrences.kerml'],
  [
    'BaseFunctions.kerml', 'ScalarFunctions.kerml', 'BooleanFunctions.kerml',
    'ControlFunctions.kerml', 'IntegerFunctions.kerml', 'NaturalFunctions.kerml',
    'RealFunctions.kerml', 'RationalFunctions.kerml', 'ComplexFunctions.kerml',
    'NumericalFunctions.kerml', 'TrigFunctions.kerml', 'StringFunctions.kerml',
    'VectorFunctions.kerml', 'DataFunctions.kerml', 'CollectionFunctions.kerml',
    'SequenceFunctions.kerml', 'OccurrenceFunctions.kerml',
  ],
  ['Observation.kerml', 'SpatialFrames.kerml'],
  ['Performances.kerml', 'Transfers.kerml'],
  ['Objects.kerml'],
  [
    'ControlPerformances.kerml', 'FeatureReferencingPerformances.kerml',
    'StatePerformances.kerml', 'TransitionPerformances.kerml', 'Triggers.kerml',
  ],
  ['KerML.kerml'],
  ['Metadata.sysml'],
  ['Items.sysml'],
  ['Parts.sysml', 'Ports.sysml'],
  ['Actions.sysml', 'States.sysml', 'Flows.sysml'],
  ['Interfaces.sysml', 'Connections.sysml', 'Allocations.sysml'],
  ['Attributes.sysml', 'Calculations.sysml', 'Constraints.sysml'],
  ['Cases.sysml'],
  ['AnalysisCases.sysml', 'VerificationCases.sysml', 'UseCases.sysml'],
  ['Requirements.sysml'],
  ['Views.sysml', 'StandardViewDefinitions.sysml'],
  ['SysML.sysml'],
  ['Quantities.sysml'],
  ['QuantityCalculations.sysml', 'TensorCalculations.sysml', 'VectorCalculations.sysml'],
  ['MeasurementReferences.sysml', 'MeasurementRefCalculations.sysml'],
  ['ISQBase.sysml'],
  [
    'ISQSpaceTime.sysml', 'ISQMechanics.sysml', 'ISQThermodynamics.sysml',
    'ISQElectromagnetism.sysml', 'ISQLight.sysml', 'ISQAcoustics.sysml',
    'ISQAtomicNuclear.sysml', 'ISQChemistryMolecular.sysml',
    'ISQCondensedMatter.sysml', 'ISQCharacteristicNumbers.sysml', 'ISQInformation.sysml',
  ],
  ['ISQ.sysml'],
  ['SIPrefixes.sysml'],
  ['SI.sysml', 'USCustomaryUnits.sysml'],
  ['Time.sysml'],
  ['SampledFunctions.sysml'],
  ['StateSpaceRepresentation.sysml'],
  ['TradeStudies.sysml'],
  ['AnalysisTooling.sysml'],
  ['CauseAndEffect.sysml', 'CausationConnections.sysml'],
  ['SpatialItems.sysml', 'ShapeItems.sysml'],
  [
    'ModelingMetadata.sysml', 'ImageMetadata.sysml',
    'ParametersOfInterestMetadata.sysml', 'RiskMetadata.sysml',
  ],
  ['RequirementDerivation.sysml', 'DerivationConnections.sysml'],
];

export interface StdlibBrowserResult {
  success: boolean;
  filesLoaded: number;
  errors: string[];
  loadTimeMs: number;
}

/**
 * Load the SysML standard library into a Langium workspace from
 * pre-bundled string content.
 *
 * @param shared  Langium shared services
 * @param files   Record mapping filename → file content (e.g. from virtual:stdlib-bundle)
 */
export async function loadStdlibBrowser(
  shared: LangiumSharedCoreServices,
  files: Record<string, string>,
): Promise<StdlibBrowserResult> {
  const start = Date.now();
  const errors: string[] = [];
  let loaded = 0;

  const { LangiumDocuments: langiumDocuments, DocumentBuilder: documentBuilder, LangiumDocumentFactory: documentFactory } = shared.workspace;

  const allDocuments: LangiumDocument[] = [];

  // Load documents in dependency order
  for (const layer of STDLIB_DEPENDENCY_LAYERS) {
    for (const filename of layer) {
      const content = files[filename];
      if (!content) {
        errors.push(`${filename}: not found in bundle`);
        continue;
      }

      try {
        const uri = URI.parse(`inmemory:///stdlib/${filename}`);

        if (langiumDocuments.hasDocument(uri)) {
          loaded++;
          continue;
        }

        const document = documentFactory.fromString(content, uri);
        langiumDocuments.addDocument(document);
        allDocuments.push(document);
        loaded++;
      } catch (err) {
        errors.push(`${filename}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  // Build all documents in a single batch
  if (allDocuments.length > 0) {
    try {
      await documentBuilder.build(allDocuments, { validation: false });
    } catch {
      // Build errors from incomplete dependencies are expected and non-fatal
    }
  }

  // Clear diagnostics for stdlib documents (linking warnings are expected)
  for (const doc of allDocuments) {
    if (doc.diagnostics && doc.diagnostics.length > 0) {
      doc.diagnostics = [];
    }
  }

  return {
    success: errors.length === 0 && loaded > 0,
    filesLoaded: loaded,
    errors,
    loadTimeMs: Date.now() - start,
  };
}
