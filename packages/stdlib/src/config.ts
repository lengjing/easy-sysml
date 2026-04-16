import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

/** Get the path to the stdlib library files */
export function getStdlibPath(): string {
  // Check environment variable first
  const envPath = process.env['SYSML_STDLIB_PATH'];
  if (envPath) return resolve(envPath);

  // Auto-detect from module location
  const currentDir = dirname(fileURLToPath(import.meta.url));
  // Check relative to dist/ (runtime) and src/ (dev)
  const candidates = [
    join(currentDir, '..', 'lib'),
    join(currentDir, '..', '..', 'lib'),
  ];

  return candidates[0]; // Primary location
}

/** Dependency layers for stdlib loading order */
export const STDLIB_DEPENDENCY_LAYERS: string[][] = [
  // Layer 0: Foundation
  ['Base.kerml'],
  // Layer 1: Scalar types
  ['ScalarValues.kerml'],
  // Layer 2: Collections and basic types
  ['VectorValues.kerml', 'Collections.kerml'],
  // Layer 3: Links and metaobjects
  ['Links.kerml', 'Metaobjects.kerml'],
  // Layer 4: Occurrences and clocks
  ['Occurrences.kerml', 'Clocks.kerml'],
  // Layer 5: Base functions
  ['BaseFunctions.kerml'],
  // Layer 6: Scalar functions
  ['ScalarFunctions.kerml'],
  // Layer 7: Type-specific functions
  ['BooleanFunctions.kerml', 'ControlFunctions.kerml', 'IntegerFunctions.kerml',
   'NaturalFunctions.kerml', 'RealFunctions.kerml', 'RationalFunctions.kerml',
   'ComplexFunctions.kerml', 'NumericalFunctions.kerml', 'TrigFunctions.kerml',
   'StringFunctions.kerml', 'VectorFunctions.kerml'],
  // Layer 8: Collection and sequence functions
  ['DataFunctions.kerml', 'CollectionFunctions.kerml', 'SequenceFunctions.kerml',
   'OccurrenceFunctions.kerml'],
  // Layer 9: Advanced KerML
  ['Observation.kerml', 'SpatialFrames.kerml'],
  // Layer 10: Performances
  ['Performances.kerml', 'Transfers.kerml'],
  // Layer 11: Objects
  ['Objects.kerml'],
  // Layer 12: Advanced performances
  ['ControlPerformances.kerml', 'FeatureReferencingPerformances.kerml',
   'StatePerformances.kerml', 'TransitionPerformances.kerml', 'Triggers.kerml'],
  // Layer 13: KerML root
  ['KerML.kerml'],
  // Layer 14: SysML foundation
  ['Metadata.sysml'],
  // Layer 15: Items
  ['Items.sysml'],
  // Layer 16: Parts and ports
  ['Parts.sysml', 'Ports.sysml'],
  // Layer 17: Actions and states
  ['Actions.sysml', 'States.sysml', 'Flows.sysml'],
  // Layer 18: Connections
  ['Interfaces.sysml', 'Connections.sysml', 'Allocations.sysml'],
  // Layer 19: Features
  ['Attributes.sysml', 'Calculations.sysml', 'Constraints.sysml'],
  // Layer 20: Cases
  ['Cases.sysml'],
  // Layer 21: Specialized cases
  ['AnalysisCases.sysml', 'VerificationCases.sysml', 'UseCases.sysml'],
  // Layer 22: Requirements
  ['Requirements.sysml'],
  // Layer 23: Views
  ['Views.sysml', 'StandardViewDefinitions.sysml'],
  // Layer 24: SysML root
  ['SysML.sysml'],
  // Layer 25: Quantities
  ['Quantities.sysml', 'MeasurementReferences.sysml'],
  // Layer 26: Unit calculations
  ['QuantityCalculations.sysml', 'TensorCalculations.sysml', 'VectorCalculations.sysml',
   'MeasurementRefCalculations.sysml'],
  // Layer 27: ISQ base
  ['ISQBase.sysml'],
  // Layer 28: ISQ domains
  ['ISQMechanics.sysml', 'ISQThermodynamics.sysml', 'ISQElectromagnetism.sysml',
   'ISQLight.sysml', 'ISQAcoustics.sysml', 'ISQAtomicNuclear.sysml',
   'ISQSpaceTime.sysml', 'ISQChemistryMolecular.sysml', 'ISQInformation.sysml',
   'ISQCondensedMatter.sysml', 'ISQCharacteristicNumbers.sysml'],
  // Layer 29: ISQ root
  ['ISQ.sysml'],
  // Layer 30: Units
  ['SIPrefixes.sysml'],
  // Layer 31: SI system
  ['SI.sysml'],
  // Layer 32: Additional units
  ['USCustomaryUnits.sysml'],
  // Layer 33: Time
  ['Time.sysml'],
  // Layer 34: Analysis
  ['SampledFunctions.sysml', 'StateSpaceRepresentation.sysml', 'TradeStudies.sysml',
   'AnalysisTooling.sysml'],
  // Layer 35: Domain libraries
  ['CauseAndEffect.sysml', 'CausationConnections.sysml', 'SpatialItems.sysml',
   'ShapeItems.sysml', 'ModelingMetadata.sysml', 'ImageMetadata.sysml',
   'ParametersOfInterestMetadata.sysml', 'RiskMetadata.sysml',
   'RequirementDerivation.sysml', 'DerivationConnections.sysml'],
];
