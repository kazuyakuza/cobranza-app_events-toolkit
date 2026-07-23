import type { AnyEventEnvelope } from '../common/envelope/envelope-types';

/**
 * Parameters for {@link IdempotencyService.executeIfNotProcessed}.
 *
 * @typeParam T - The handler's return type.
 *
 * @see {@link IdempotencyService.executeIfNotProcessed} for usage examples.
 */
export interface ExecuteIfNotProcessedParams<T> {
  /** The event envelope to check and mark. */
  event: AnyEventEnvelope<unknown>;
  /** Business logic to execute when the event is not a duplicate. */
  handler: () => Promise<T>;
  /**
   * Optional TTL override in seconds. Falls back to
   * {@link IdempotencyServiceOptions.defaultTtlSeconds} when omitted.
   */
  ttlSeconds?: number;
}
