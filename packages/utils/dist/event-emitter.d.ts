import type { Disposable } from './disposable.js';
export declare class SimpleEventEmitter<T> implements Disposable {
    private handlers;
    on(handler: (event: T) => void): Disposable;
    emit(event: T): void;
    dispose(): void;
}
//# sourceMappingURL=event-emitter.d.ts.map