import { Injectable } from '@nestjs/common';
import type { AnyEventEnvelope } from '../common/envelope/envelope-types';
import { buildIdempotencyKey } from '../idempotency/build-idempotency-key.util';
import type { ExecuteIfNotProcessedParams } from '../idempotency/execute-if-not-processed-params.interface';

/**
 * In-memory mock for {@link IdempotencyService}.
 *
 * Tracks processed event keys in a `Map`. Skips duplicate events on
 * {@link executeIfNotProcessed} the same way the real service does. Use the
 * {@link clear} method to reset state between tests.
 *
 * @see {@link MockOutboxService} for the analogous outbox mock.
 */
@Injectable()
export class MockIdempotencyService {
  private readonly processed = new Map<string, boolean>();

  /** Returns true when the event key has been marked as processed. */
  async isDuplicate(event: AnyEventEnvelope<unknown>): Promise<boolean> {
    const key = buildIdempotencyKey(event);
    return this.processed.has(key);
  }

  /** Marks the event key as processed. Re-marking overwrites (matches MemoryIdempotencyRepository). */
  async markAsProcessed(event: AnyEventEnvelope<unknown>, ttlSeconds?: number): Promise<void> {
    void ttlSeconds;
    const key = buildIdempotencyKey(event);
    this.processed.set(key, true);
  }

  /** Executes the handler only when the event is not a duplicate, then marks it. */
  async executeIfNotProcessed<T>(params: ExecuteIfNotProcessedParams<T>): Promise<T | undefined> {
    if (await this.isDuplicate(params.event)) return undefined;
    const result = await params.handler();
    await this.markAsProcessed(params.event);
    return result;
  }

  /** Returns the set of processed event keys (for assertions). */
  get processedKeys(): ReadonlySet<string> {
    return new Set(this.processed.keys());
  }

  /** Number of processed event keys. */
  get count(): number {
    return this.processed.size;
  }

  /** Resets all tracked processed keys. */
  clear(): void {
    this.processed.clear();
  }
}
