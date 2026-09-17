/**
 * Per-key FIFO mutex. Used to serialize writes to the same resource
 * (e.g. a single table's rows.json).
 *
 * For <20 users on a single server, process-level locks are sufficient.
 * If we ever scale out, swap for a Redis-backed implementation behind the
 * same interface.
 */
export class KeyedMutex {
  private chains = new Map<string, Promise<unknown>>();

  async run<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.chains.get(key) ?? Promise.resolve();
    let release!: () => void;
    const next = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.chains.set(
      key,
      prev.then(() => next),
    );
    try {
      await prev;
      return await fn();
    } finally {
      release();
      // Clean up if this is still the tail
      if (this.chains.get(key) === prev.then(() => next)) {
        this.chains.delete(key);
      }
    }
  }
}

export const tableWriteMutex = new KeyedMutex();