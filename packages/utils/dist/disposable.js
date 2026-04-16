/** Composite disposable that manages a collection of disposables */
export class DisposableCollection {
    disposables = [];
    add(disposable) {
        this.disposables.push(disposable);
    }
    dispose() {
        const toDispose = this.disposables.slice().reverse();
        this.disposables.length = 0;
        for (const disposable of toDispose) {
            disposable.dispose();
        }
    }
}
//# sourceMappingURL=disposable.js.map