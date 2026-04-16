import type { Disposable } from './disposable.js';

export class SimpleEventEmitter<T> implements Disposable {
  private handlers = new Set<(event: T) => void>();

  on(handler: (event: T) => void): Disposable {
    this.handlers.add(handler);
    return { dispose: () => this.handlers.delete(handler) };
  }

  emit(event: T): void {
    for (const handler of this.handlers) {
      handler(event);
    }
  }

  dispose(): void {
    this.handlers.clear();
  }
}
