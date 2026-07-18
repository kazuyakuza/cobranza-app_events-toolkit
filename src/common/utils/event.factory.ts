import { EventContext } from '../envelope/event-context.interface';
import { EventEnvelope } from '../envelope/event-envelope.class';
import { GlobalEventContext } from '../envelope/global-event-context.interface';
import { GlobalEventEnvelope } from '../envelope/global-event-envelope.class';
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

/**
 * Creates a fully-populated {@link GlobalEventEnvelope} for tenant-less operations.
 *
 * Auto-fills `id` (UUIDv7 `evt_`-prefixed) and `produced_at` (ISO 8601 UTC).
 *
 * @typeParam T - The domain-specific business payload type.
 * @param data - Business payload to include in the event envelope.
 * @param context - Metadata required to build the envelope (no companyId).
 * @returns A fully-initialized {@link GlobalEventEnvelope} instance.
 */
export function createGlobalEvent<T>(data: T, context: GlobalEventContext): GlobalEventEnvelope<T> {
  return new GlobalEventEnvelope<T>({
    id: generateEventId(),
    produced_at: nowIso(),
    type: context.type,
    version: context.version,
    producer: context.producer,
    actor_type: context.actorType,
    actor_id: context.actorId,
    correlation_id: context.correlationId,
    causation_id: context.causationId,
    trace_id: context.traceId,
    reply_to: context.replyTo,
    data,
  });
}
