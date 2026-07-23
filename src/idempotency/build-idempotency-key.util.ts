import type { AnyEventEnvelope } from '../common/envelope/envelope-types';

const KEY_SEPARATOR = ':';

/**
 * Builds a deterministic idempotency key from an event envelope.
 *
 * The composite key `${event.id}:${event.correlation_id}` guarantees
 * uniqueness across both the event identity and the request context.
 *
 * @param event - The event envelope to derive the key from.
 * @returns A deterministic string key suitable for {@link IdempotencyRepository.isProcessed}.
 *
 * @example
 * ```ts
 * const key = buildIdempotencyKey(envelope);
 * // => "evt-abc-123:corr-xyz-789"
 * ```
 *
 * @see {@link IdempotencyService.isDuplicate} — uses this key internally.
 */
export function buildIdempotencyKey(event: AnyEventEnvelope<unknown>): string {
  return `${event.id}${KEY_SEPARATOR}${event.correlation_id}`;
}
