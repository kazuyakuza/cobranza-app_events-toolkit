import { IdempotencyRepository } from './idempotency.types';

interface MemoryEntry {
  createdAt: string;
  expiresAt: string | null;
}

/**
 * In-memory {@link IdempotencyRepository} intended for **testing only**.
 *
 * Backed by a plain `Map`. Overwrites on repeated `markAsProcessed` calls
 * (no conflict-error semantics). Expired entries are treated as not processed.
 *
 * **Not suitable for production** — data is lost on process restart and there
 * is no cross-process coordination.
 *
 * @see {@link SqliteIdempotencyRepository} for a file-based alternative.
 * @see {@link PostgresIdempotencyRepository} for a production-grade alternative.
 */
export class MemoryIdempotencyRepository implements IdempotencyRepository {
  private readonly store = new Map<string, MemoryEntry>();

  /** @inheritdoc */
  async isProcessed(key: string): Promise<boolean> {
    const entry = this.store.get(key);
    return entry !== undefined && !this.isExpired(entry);
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
    return entry.expiresAt !== null && entry.expiresAt < new Date().toISOString();
  }
}
