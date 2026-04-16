/** Disposable resource interface */
export interface Disposable {
  dispose(): void;
}

/** Composite disposable that manages a collection of disposables */
export class DisposableCollection implements Disposable {
  private disposables: Disposable[] = [];

  add(disposable: Disposable): void {
    this.disposables.push(disposable);
  }

  dispose(): void {
    const toDispose = this.disposables.slice().reverse();
    this.disposables.length = 0;
    for (const disposable of toDispose) {
      disposable.dispose();
    }
  }
}
