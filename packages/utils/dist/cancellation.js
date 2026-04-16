/** Cancellation source that produces tokens */
export class CancellationSource {
    _isCancelled = false;
    handlers = [];
    token;
    constructor() {
        const source = this;
        this.token = {
            get isCancelled() {
                return source._isCancelled;
            },
            onCancelled(handler) {
                if (source._isCancelled) {
                    handler();
                }
                else {
                    source.handlers.push(handler);
                }
            },
        };
    }
    cancel() {
        if (!this._isCancelled) {
            this._isCancelled = true;
            for (const handler of this.handlers) {
                handler();
            }
            this.handlers.length = 0;
        }
    }
    dispose() {
        this.handlers.length = 0;
    }
}
/** A token that is never cancelled */
export const CancellationToken_None = {
    isCancelled: false,
    onCancelled() {
        // Never fires — this token is never cancelled
    },
};
//# sourceMappingURL=cancellation.js.map