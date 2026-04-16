/**
 * Test utilities for @easy-sysml/stdlib tests.
 *
 * Creates a minimal Langium services instance using the SysML / KerML
 * generated grammar modules, suitable for loading stdlib documents.
 */

import {
    createDefaultCoreModule,
    createDefaultSharedCoreModule,
    inject,
    type LangiumSharedCoreServices,
    type LangiumCoreServices,
} from 'langium';
import { NodeFileSystem } from 'langium/node';
import {
    SysMLGeneratedSharedModule,
    SysMLGeneratedModule,
    KerMLGeneratedModule,
} from '@easy-sysml/grammar';

export interface TestServices {
    shared: LangiumSharedCoreServices;
    SysML: LangiumCoreServices;
    KerML: LangiumCoreServices;
}

/**
 * Create Langium services for testing purposes (no LSP layer).
 */
export function createServicesForTesting(): TestServices {
    const shared = inject(
        createDefaultSharedCoreModule(NodeFileSystem),
        SysMLGeneratedSharedModule,
    );

    const SysML = inject(
        createDefaultCoreModule({ shared }),
        SysMLGeneratedModule,
    );

    const KerML = inject(
        createDefaultCoreModule({ shared }),
        KerMLGeneratedModule,
    );

    shared.ServiceRegistry.register(SysML);
    shared.ServiceRegistry.register(KerML);

    return { shared, SysML, KerML };
}
