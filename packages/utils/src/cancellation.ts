/** Cancellation token */
export interface CancellationToken {
  readonly isCancelled: boolean;
  onCancelled(handler: () => void): void;
}

/** Cancellation source that produces tokens */
export class CancellationSource {
  private _isCancelled = false;
  private handlers: (() => void)[] = [];

  readonly token: CancellationToken;

  constructor() {
    const source = this;
    this.token = {
      get isCancelled(): boolean {
        return source._isCancelled;
      },
      onCancelled(handler: () => void): void {
        if (source._isCancelled) {
          handler();
        } else {
          source.handlers.push(handler);
        }
      },
    };
  }

  cancel(): void {
    if (!this._isCancelled) {
      this._isCancelled = true;
      for (const handler of this.handlers) {
        handler();
      }
      this.handlers.length = 0;
    }
  }

  dispose(): void {
    this.handlers.length = 0;
  }
}

/** A token that is never cancelled */
export const CancellationToken_None: CancellationToken = {
  isCancelled: false,
  onCancelled(): void {
    // Never fires — this token is never cancelled
  },
};
