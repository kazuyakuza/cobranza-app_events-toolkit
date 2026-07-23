import type { AnyEventEnvelope } from '../common/envelope/envelope-types';

/**
 * Parameters for {@link IdempotencyService.executeIfNotProcessed}.
 *
 * @typeParam T - The handler's return type.
 */
export interface ExecuteIfNotProcessedParams<T> {
  /** The event envelope to check and mark. */
  event: AnyEventEnvelope<unknown>;
  /** Business logic to execute when the event is not a duplicate. */
  handler: () => Promise<T>;
  /** Optional TTL override. Falls back to the service default when omitted. */
  ttlSeconds?: number;
}
