import { IdempotencyRepository } from './idempotency.types';

interface MemoryEntry {
  createdAt: string;
  expiresAt: string | null;
}

/**
 * In-memory {@link IdempotencyRepository} intended for testing only.
 *
 * Backed by a plain `Map`. Overwrites on repeated `markAsProcessed` calls
 * (no conflict-error semantics). Expired entries are treated as not processed.
 */
export class MemoryIdempotencyRepository implements IdempotencyRepository {
  private readonly store = new Map<string, MemoryEntry>();

  /** @inheritdoc */
  async isProcessed(key: string): Promise<boolean> {
    const entry = this.store.get(key);
    if (entry === undefined) {
      return false;
    }
    if (this.isExpired(entry)) {
      return false;
    }
    return true;
  }

  /** @inheritdoc */
  async markAsProcessed(key: string, ttlSeconds?: number): Promise<void> {
    const createdAt = new Date().toISOString();
    const expiresAt = ttlSeconds == null ? null : new Date(Date.now() + ttlSeconds * 1000).toISOString();
    this.store.set(key, { createdAt, expiresAt });
  }

  /** @inheritdoc */
  async clearExpired(): Promise<void> {
    for (const [key, entry] of this.store.entries()) {
      if (this.isExpired(entry)) {
        this.store.delete(key);
      }
    }
  }

  private isExpired(entry: MemoryEntry): boolean {
    if (entry.expiresAt === null) {
      return false;
    }
    return entry.expiresAt < new Date().toISOString();
  }
}
