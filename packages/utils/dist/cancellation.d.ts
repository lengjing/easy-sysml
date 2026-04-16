/** Cancellation token */
export interface CancellationToken {
    readonly isCancelled: boolean;
    onCancelled(handler: () => void): void;
}
/** Cancellation source that produces tokens */
export declare class CancellationSource {
    private _isCancelled;
    private handlers;
    readonly token: CancellationToken;
    constructor();
    cancel(): void;
    dispose(): void;
}
/** A token that is never cancelled */
export declare const CancellationToken_None: CancellationToken;
//# sourceMappingURL=cancellation.d.ts.map