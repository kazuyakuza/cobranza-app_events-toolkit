import type { AnyEventEnvelope } from '../common/envelope/envelope-types';

const KEY_SEPARATOR = ':';

/**
 * Builds a deterministic idempotency key from an event envelope.
 *
 * The composite key `${event.id}:${event.correlation_id}` guarantees
 * uniqueness across both the event identity and the request context.
 */
export function buildIdempotencyKey(event: AnyEventEnvelope<unknown>): string {
  return `${event.id}${KEY_SEPARATOR}${event.correlation_id}`;
}
