/**
 * Standard Library Configuration
 *
 * Single source of truth for stdlib file ordering and configuration.
 * Files are organized in dependency layers — each layer can be loaded
 * in parallel, but layers must be loaded sequentially.
 *
 * Total: 94 files (36 KerML + 58 SysML)
 */
/**
 * Complete SysML v2 Standard Library organized in dependency layers.
 *
 * - KerML foundation (layers 0–10): 36 files
 * - SysML core (layers 11–21): 21 files
 * - Domain libraries (layers 22–35): 37 files
 */
export const STDLIB_DEPENDENCY_LAYERS = [
    // =========================================================================
    // KERML FOUNDATION (36 files)
    // =========================================================================
    // Layer 0: Root — no dependencies
    ['Base.kerml'],
    // Layer 1: Data types — depend on Base
    ['ScalarValues.kerml', 'VectorValues.kerml'],
    // Layer 2: Collections — depends on ScalarValues
    ['Collections.kerml'],
    // Layer 3: Links & Metaobjects — depend on Base
    ['Links.kerml', 'Metaobjects.kerml'],
    // Layer 4: Clocks & Occurrences — depend on Links
    ['Clocks.kerml', 'Occurrences.kerml'],
    // Layer 5: Function libraries — depend on ScalarValues, Occurrences
    [
        'BaseFunctions.kerml',
        'ScalarFunctions.kerml',
        'BooleanFunctions.kerml',
        'ControlFunctions.kerml',
        'IntegerFunctions.kerml',
        'NaturalFunctions.kerml',
        'RealFunctions.kerml',
        'RationalFunctions.kerml',
        'ComplexFunctions.kerml',
        'NumericalFunctions.kerml',
        'TrigFunctions.kerml',
        'StringFunctions.kerml',
        'VectorFunctions.kerml',
        'DataFunctions.kerml',
        'CollectionFunctions.kerml',
        'SequenceFunctions.kerml',
        'OccurrenceFunctions.kerml',
    ],
    // Layer 6: Observation & Spatial — depend on Occurrences
    ['Observation.kerml', 'SpatialFrames.kerml'],
    // Layer 7: Performances & Transfers — depend on Occurrences
    ['Performances.kerml', 'Transfers.kerml'],
    // Layer 8: Objects — depends on Occurrences + Performances
    ['Objects.kerml'],
    // Layer 9: Advanced behavioral — depend on Performances, Objects
    [
        'ControlPerformances.kerml',
        'FeatureReferencingPerformances.kerml',
        'StatePerformances.kerml',
        'TransitionPerformances.kerml',
        'Triggers.kerml',
    ],
    // Layer 10: KerML aggregation
    ['KerML.kerml'],
    // =========================================================================
    // SYSML CORE LIBRARY (21 files)
    // =========================================================================
    // Layer 11: Metadata foundation
    ['Metadata.sysml'],
    // Layer 12: Items — base for Parts
    ['Items.sysml'],
    // Layer 13: Parts & Ports
    ['Parts.sysml', 'Ports.sysml'],
    // Layer 14: Actions, States, Flows
    ['Actions.sysml', 'States.sysml', 'Flows.sysml'],
    // Layer 15: Connections layer
    ['Interfaces.sysml', 'Connections.sysml', 'Allocations.sysml'],
    // Layer 16: Attributes & Calculations
    ['Attributes.sysml', 'Calculations.sysml', 'Constraints.sysml'],
    // Layer 17: Cases
    ['Cases.sysml'],
    // Layer 18: Case specializations
    ['AnalysisCases.sysml', 'VerificationCases.sysml', 'UseCases.sysml'],
    // Layer 19: Requirements
    ['Requirements.sysml'],
    // Layer 20: Views
    ['Views.sysml', 'StandardViewDefinitions.sysml'],
    // Layer 21: SysML aggregation
    ['SysML.sysml'],
    // =========================================================================
    // DOMAIN LIBRARIES — QUANTITIES & UNITS (18 files)
    // =========================================================================
    // Layer 22: Quantities foundation
    ['Quantities.sysml'],
    // Layer 23: Quantity calculations
    ['QuantityCalculations.sysml', 'TensorCalculations.sysml', 'VectorCalculations.sysml'],
    // Layer 24: Measurement references
    ['MeasurementReferences.sysml', 'MeasurementRefCalculations.sysml'],
    // Layer 25: ISQ Base
    ['ISQBase.sysml'],
    // Layer 26: ISQ domain-specific (11 files)
    [
        'ISQSpaceTime.sysml',
        'ISQMechanics.sysml',
        'ISQThermodynamics.sysml',
        'ISQElectromagnetism.sysml',
        'ISQLight.sysml',
        'ISQAcoustics.sysml',
        'ISQAtomicNuclear.sysml',
        'ISQChemistryMolecular.sysml',
        'ISQCondensedMatter.sysml',
        'ISQCharacteristicNumbers.sysml',
        'ISQInformation.sysml',
    ],
    // Layer 27: ISQ aggregation
    ['ISQ.sysml'],
    // Layer 28: SI prefixes
    ['SIPrefixes.sysml'],
    // Layer 29: Units
    ['SI.sysml', 'USCustomaryUnits.sysml'],
    // Layer 30: Time
    ['Time.sysml'],
    // =========================================================================
    // DOMAIN LIBRARIES — ANALYSIS (4 files)
    // =========================================================================
    // Layer 31–34: Analysis libraries
    ['SampledFunctions.sysml'],
    ['StateSpaceRepresentation.sysml'],
    ['TradeStudies.sysml'],
    ['AnalysisTooling.sysml'],
    // =========================================================================
    // DOMAIN LIBRARIES — OTHER (10 files)
    // =========================================================================
    // Layer 35: Cause and effect
    ['CauseAndEffect.sysml', 'CausationConnections.sysml'],
    // Layer 36: Spatial items
    ['SpatialItems.sysml', 'ShapeItems.sysml'],
    // Layer 37: Metadata extensions
    [
        'ModelingMetadata.sysml',
        'ImageMetadata.sysml',
        'ParametersOfInterestMetadata.sysml',
        'RiskMetadata.sysml',
    ],
    // Layer 38: Requirement derivation
    ['RequirementDerivation.sysml', 'DerivationConnections.sysml'],
];
/** Total number of stdlib files. */
export const STDLIB_FILE_COUNT = STDLIB_DEPENDENCY_LAYERS.flat().length;
/** Get all stdlib filenames as a flat array. */
export function getStdlibFiles() {
    return STDLIB_DEPENDENCY_LAYERS.flat();
}
/** Check whether a filename (or path) refers to a stdlib file. */
export function isStdlibFile(filename) {
    const basename = filename.includes('/')
        ? filename.split('/').pop()
        : filename;
    return getStdlibFiles().includes(basename);
}
//# sourceMappingURL=config.js.map