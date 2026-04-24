standard library package AspectViewDefinitions {
    doc /*
         * This package defines ASPECT view definitions for engineering domain perspectives
         * in MBSE (Model-Based Systems Engineering) workflows.
         *
         * Each ASPECT represents a specific engineering viewpoint that can be applied
         * to model elements to classify and organize them by engineering domain.
         * These view definitions support structured analysis across different engineering
         * disciplines and system levels.
         */
    public import SysML::*;
    public import StandardViewDefinitions::*;

    // =========================================================================
    // ASPECT Views — Engineering Domain Perspectives
    // =========================================================================

    view def <fav> FunctionalView specializes GeneralView {
        doc /*
             * ASPECT view (Functional) to present the functional decomposition
             * and behavioral analysis of the system.
             * Presents functions, functional flows, functional allocations, and
             * input/output relationships between functions.
             * Typical use: functional analysis, functional architecture definition,
             * allocation of functions to logical or physical components.
             */
    }

    view def <lav> LogicalView specializes GeneralView {
        doc /*
             * ASPECT view (Logical) to present the logical architecture of the system.
             * Presents logical components, logical interfaces, and logical data flows.
             * The logical architecture is implementation-independent and describes
             * the system in terms of logical building blocks and their interactions.
             * Typical use: logical architecture definition, logical interface specification,
             * allocation of functions to logical components.
             */
    }

    view def <pav> PhysicalView specializes GeneralView {
        doc /*
             * ASPECT view (Physical) to present the physical architecture of the system.
             * Presents physical components, physical interfaces, physical connections,
             * and resource allocations.
             * The physical architecture describes the system in terms of concrete
             * physical building blocks and their real-world interactions.
             * Typical use: physical architecture definition, physical interface specification,
             * allocation of logical components to physical items.
             */
    }

    view def <icdv> ICDView specializes GeneralView {
        doc /*
             * ASPECT view (ICD - Interface Control Document) to present interface
             * definitions and control information between system elements.
             * Presents interface specifications, data dictionaries, signal definitions,
             * protocol specifications, and interface compliance requirements.
             * Typical use: interface definition between subsystems or external systems,
             * ICD generation and management, interface compliance verification.
             */
    }

    view def <parv> ParameterView specializes GeneralView {
        doc /*
             * ASPECT view (Parameter) to present parametric relationships and
             * constraint networks within the system model.
             * Presents attribute definitions, constraint usages, value bindings,
             * parametric equations, and design parameter relationships.
             * Typical use: parametric modeling, trade study setup, constraint analysis,
             * budget allocation (mass, power, cost), performance parameter tracking.
             */
    }

    view def <hwv> HardwareView specializes PhysicalView {
        doc /*
             * ASPECT view (Hardware) to present hardware-specific architecture
             * and design of the system.
             * Presents hardware components (PCBs, processors, sensors, actuators),
             * hardware interfaces (electrical, mechanical, thermal), and hardware
             * resource allocations.
             * Typical use: hardware architecture definition, hardware BOM (Bill of Materials),
             * hardware interface specification, hardware-software interface definition.
             */
    }

    view def <crv> CriticalView specializes GeneralView {
        doc /*
             * ASPECT view (Critical) to present safety-critical, security-critical,
             * or mission-critical aspects of the system.
             * Presents critical functions, critical components, fault trees, hazard analyses,
             * safety constraints, and criticality classifications.
             * Typical use: safety analysis, FMEA (Failure Mode and Effects Analysis),
             * FTA (Fault Tree Analysis), critical item list management, safety case support.
             */
    }

    view def <sfav> SystemsFunctionalView specializes FunctionalView {
        doc /*
             * ASPECT view (SystemsFunctional) to present system-level functional
             * architecture bridging the system context and subsystem functions.
             * Presents top-level system functions, external interfaces, operational
             * scenarios, and system-level functional flows.
             * Typical use: system-level functional analysis, CONOPS (Concept of Operations)
             * modeling, operational scenario definition, system function allocation to
             * subsystems.
             */
    }

    view def <lruv> LRUFunctionView specializes FunctionalView {
        doc /*
             * ASPECT view (LRUFunction) to present functions allocated to
             * Line Replaceable Units (LRUs).
             * Presents LRU-level functional decomposition, function-to-LRU allocation,
             * LRU interfaces, and LRU functional dependencies.
             * LRUs are the primary field-replaceable components in aerospace and defense
             * systems.
             * Typical use: avionics/defense system architecture, LRU function allocation,
             * LRU interface definition, maintenance analysis.
             */
    }

    view def <civ> ComponentItemView specializes PhysicalView {
        doc /*
             * ASPECT view (ComponentItem) to present the component and item hierarchy
             * of the physical system.
             * Presents physical components, part definitions, item definitions, and
             * their containment/assembly relationships.
             * Typical use: product structure definition, bill of materials (BOM) management,
             * component selection and reuse, item configuration management.
             */
    }

    view def <fcv> FunctionCircuitView specializes HardwareView {
        doc /*
             * ASPECT view (FunctionCircuit) to present the functional circuit
             * architecture linking functions to electronic circuit implementations.
             * Presents electronic functions, circuit block diagram elements, signal flows,
             * power distribution, and function-to-circuit allocation.
             * Typical use: electronic system architecture, functional circuit block diagrams,
             * allocation of software/firmware functions to hardware circuits,
             * electronic interface definition.
             */
    }
}
