import { EventContext } from '../envelope/event-context.interface';
import { EventEnvelope } from '../envelope/event-envelope.class';
import { generateEventId } from './uuid.utils';
import { nowIso } from './date.utils';

/**
 * Creates a fully-populated {@link EventEnvelope} from business data and event context.
 *
 * Auto-fills:
 * - `id` — generated via {@link generateEventId} (UUIDv7 with `evt_` prefix)
 * - `produced_at` — current UTC ISO 8601 timestamp via {@link nowIso}
 *
 * Maps all {@link EventContext} fields (camelCase) to {@link EventEnvelope}
 * fields (snake_case) following the Cobranza App event messaging convention.
 *
 * @typeParam T — The domain-specific business payload type.
 * @param data — Business payload to include in the event envelope.
 * @param context — Metadata required to build the envelope (type, version, producer, etc.).
 * @returns A fully-initialized {@link EventEnvelope} instance.
 *
 * @example
 * ```ts
 * const event = createEvent(
 *   { amount: 1500, currency: 'ARS' },
 *   {
 *     type: 'payment.received',
 *     version: '1.0.0',
 *     producer: 'payment-service',
 *     companyId: '550e8400-e29b-41d4-a716-446655440000',
 *     actorType: ActorType.CLIENT,
 *     actorId: 'user-123',
 *     correlationId: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
 *   }
 * );
 * ```
 */
export function createEvent<T>(data: T, context: EventContext): EventEnvelope<T> {
  return new EventEnvelope<T>({
    id: generateEventId(),
    produced_at: nowIso(),
    type: context.type,
    version: context.version,
    producer: context.producer,
    company_id: context.companyId,
    actor_type: context.actorType,
    actor_id: context.actorId,
    correlation_id: context.correlationId,
    causation_id: context.causationId,
    trace_id: context.traceId,
    reply_to: context.replyTo,
    data,
  });
}
