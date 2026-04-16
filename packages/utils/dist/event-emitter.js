export class SimpleEventEmitter {
    handlers = new Set();
    on(handler) {
        this.handlers.add(handler);
        return { dispose: () => this.handlers.delete(handler) };
    }
    emit(event) {
        for (const handler of this.handlers) {
            handler(event);
        }
    }
    dispose() {
        this.handlers.clear();
    }
}
//# sourceMappingURL=event-emitter.js.map