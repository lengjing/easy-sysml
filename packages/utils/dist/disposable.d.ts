/** Disposable resource interface */
export interface Disposable {
    dispose(): void;
}
/** Composite disposable that manages a collection of disposables */
export declare class DisposableCollection implements Disposable {
    private disposables;
    add(disposable: Disposable): void;
    dispose(): void;
}
//# sourceMappingURL=disposable.d.ts.map