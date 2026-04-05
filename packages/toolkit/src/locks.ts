export interface KeyedLock {
  run<T>(key: string, task: () => Promise<T> | T): Promise<T>;
  isLocked(key: string): boolean;
}

export function createKeyedLock(): KeyedLock {
  const queues = new Map<string, Promise<void>>();

  return {
    isLocked(key) {
      return queues.has(key);
    },
    async run(key, task) {
      const previous = queues.get(key) ?? Promise.resolve();
      let release!: () => void;
      const current = new Promise<void>((resolve) => {
        release = resolve;
      });

      queues.set(key, current);

      await previous;

      try {
        return await task();
      } finally {
        release();

        if (queues.get(key) === current) {
          queues.delete(key);
        }
      }
    },
  };
}
