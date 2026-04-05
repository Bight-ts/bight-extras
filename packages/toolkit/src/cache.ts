type CacheFactory<T> = () => Promise<T> | T;

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

export interface MemoryCacheOptions {
  now?: () => number;
}

export class MemoryCache<T> {
  private readonly entries = new Map<string, CacheEntry<T>>();
  private readonly inflight = new Map<string, Promise<T>>();
  private readonly now: () => number;

  constructor(options: MemoryCacheOptions = {}) {
    this.now = options.now ?? (() => Date.now());
  }

  get size() {
    this.sweepExpired();
    return this.entries.size;
  }

  get(key: string): T | undefined {
    const entry = this.getEntry(key);
    return entry?.value;
  }

  has(key: string) {
    return this.getEntry(key) !== undefined;
  }

  set(key: string, value: T, ttlMs: number) {
    this.entries.set(key, {
      value,
      expiresAt: this.now() + ttlMs,
    });

    return value;
  }

  delete(key: string) {
    this.inflight.delete(key);
    return this.entries.delete(key);
  }

  clear() {
    this.entries.clear();
    this.inflight.clear();
  }

  async remember(key: string, ttlMs: number, factory: CacheFactory<T>) {
    const entry = this.getEntry(key);
    if (entry) {
      return entry.value;
    }

    const value = await factory();
    this.set(key, value, ttlMs);
    return value;
  }

  async rememberInflight(key: string, ttlMs: number, factory: CacheFactory<T>) {
    const entry = this.getEntry(key);
    if (entry) {
      return entry.value;
    }

    const pending = this.inflight.get(key);
    if (pending) {
      return pending;
    }

    const task = Promise.resolve(factory())
      .then((value) => {
        this.set(key, value, ttlMs);
        return value;
      })
      .finally(() => {
        this.inflight.delete(key);
      });

    this.inflight.set(key, task);
    return task;
  }

  private getEntry(key: string): CacheEntry<T> | undefined {
    const entry = this.entries.get(key);
    if (!entry) {
      return undefined;
    }

    if (this.now() > entry.expiresAt) {
      this.entries.delete(key);
      return undefined;
    }

    return entry;
  }

  private sweepExpired() {
    const now = this.now();

    for (const [key, entry] of this.entries) {
      if (now > entry.expiresAt) {
        this.entries.delete(key);
      }
    }
  }
}

export function createMemoryCache<T>(options?: MemoryCacheOptions) {
  return new MemoryCache<T>(options);
}
