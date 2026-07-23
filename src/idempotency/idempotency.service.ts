import { Injectable, Inject } from '@nestjs/common';
import type { AnyEventEnvelope } from '../common/envelope/envelope-types';
import { buildIdempotencyKey } from './build-idempotency-key.util';
import { IDEMPOTENCY_SERVICE_DEPS_TOKEN, IdempotencyServiceDeps } from './idempotency-service-deps.interface';
import { ExecuteIfNotProcessedParams } from './execute-if-not-processed-params.interface';

/**
 * Central service for idempotency checks and deduplication.
 *
 * Provides both low-level methods ({@link isDuplicate}, {@link markAsProcessed})
 * and a high-level convenience wrapper ({@link executeIfNotProcessed}) that
 * atomically checks, executes, and marks an event as processed.
 *
 * When the handler passed to {@link executeIfNotProcessed} throws, the event is
 * intentionally **not** marked as processed, allowing retries.
 *
 * @see {@link OutboxService} for the analogous outbox service.
 *
 * @example Injecting the service
 * ```ts
 * constructor(private readonly idempotency: IdempotencyService) {}
 * ```
 */
@Injectable()
export class IdempotencyService {
  constructor(
    @Inject(IDEMPOTENCY_SERVICE_DEPS_TOKEN) private readonly deps: IdempotencyServiceDeps,
  ) {}

  /**
   * Returns `true` when the event has already been processed
   * (key exists in the repository and has not expired).
   *
   * @param event - The event envelope to check.
   *
   * @example
   * ```ts
   * if (await this.idempotency.isDuplicate(event)) {
   *   return; // skip duplicate
   * }
   * ```
   */
  async isDuplicate(event: AnyEventEnvelope<unknown>): Promise<boolean> {
    const key = buildIdempotencyKey(event);
    return this.deps.repository.isProcessed(key);
  }

  /**
   * Records the event as processed.
   *
   * @param event - The event envelope to mark.
   * @param ttlSeconds - Optional TTL override. Falls back to
   *   {@link IdempotencyServiceOptions.defaultTtlSeconds} when omitted.
   *
   * @example
   * ```ts
   * await this.idempotency.markAsProcessed(event, 3600); // expires in 1 hour
   * ```
   */
  async markAsProcessed(event: AnyEventEnvelope<unknown>, ttlSeconds?: number): Promise<void> {
    const key = buildIdempotencyKey(event);
    const resolvedTtl = this.resolveTtl(ttlSeconds);
    await this.deps.repository.markAsProcessed(key, resolvedTtl);
  }

  /**
   * Executes the handler only when the event has **not** been processed before.
   * Marks the event as processed immediately after the handler succeeds.
   *
   * If the handler throws, the event is **not** marked as processed, so the
   * next invocation will re-execute the handler.
   *
   * @typeParam T - The handler's return type.
   * @param params - Event, handler, and optional TTL.
   * @returns The handler result when executed, or `undefined` when the event is a duplicate.
   *
   * @example
   * ```ts
   * const result = await this.idempotency.executeIfNotProcessed({
   *   event,
   *   handler: async () => processPayment(event.data),
   *   ttlSeconds: 86400,
   * });
   * ```
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
