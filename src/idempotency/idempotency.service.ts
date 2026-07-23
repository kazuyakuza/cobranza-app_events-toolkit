import { Injectable, Inject } from '@nestjs/common';
import type { AnyEventEnvelope } from '../common/envelope/envelope-types';
import { buildIdempotencyKey } from './build-idempotency-key.util';
import { IDEMPOTENCY_SERVICE_DEPS_TOKEN, IdempotencyServiceDeps } from './idempotency-service-deps.interface';
import { ExecuteIfNotProcessedParams } from './execute-if-not-processed-params.interface';

/**
 * Central service for idempotency checks and deduplication.
 *
 * Provides both low-level methods (isDuplicate, markAsProcessed) and a
 * high-level convenience wrapper (executeIfNotProcessed) that atomically
 * checks, executes, and marks an event as processed.
 *
 * When the handler passed to executeIfNotProcessed throws, the event is
 * intentionally NOT marked as processed, allowing retries.
 */
@Injectable()
export class IdempotencyService {
  constructor(
    @Inject(IDEMPOTENCY_SERVICE_DEPS_TOKEN) private readonly deps: IdempotencyServiceDeps,
  ) {}

  /** Returns true when the event has already been processed (key exists and has not expired). */
  async isDuplicate(event: AnyEventEnvelope<unknown>): Promise<boolean> {
    const key = buildIdempotencyKey(event);
    return this.deps.repository.isProcessed(key);
  }

  /**
   * Records the event as processed.
   *
   * @param event - The event envelope to mark.
   * @param ttlSeconds - Optional TTL override. Falls back to defaultTtlSeconds when omitted.
   */
  async markAsProcessed(event: AnyEventEnvelope<unknown>, ttlSeconds?: number): Promise<void> {
    const key = buildIdempotencyKey(event);
    const resolvedTtl = this.resolveTtl(ttlSeconds);
    await this.deps.repository.markAsProcessed(key, resolvedTtl);
  }

  /**
   * Executes the handler only when the event has NOT been processed before.
   * Marks the event as processed immediately after the handler succeeds.
   *
   * @returns The handler result when executed, or `undefined` when the event is a duplicate.
   */
  async executeIfNotProcessed<T>(params: ExecuteIfNotProcessedParams<T>): Promise<T | undefined> {
    if (await this.isDuplicate(params.event)) {
      return undefined;
    }
    const result = await params.handler();
    await this.markAsProcessed(params.event, params.ttlSeconds);
    return result;
  }

  private resolveTtl(explicit: number | undefined): number | undefined {
    return explicit ?? this.deps.options?.defaultTtlSeconds;
  }
}
