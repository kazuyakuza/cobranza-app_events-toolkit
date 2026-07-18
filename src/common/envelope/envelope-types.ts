import type { EventEnvelope } from './event-envelope.class';
import type { GlobalEventEnvelope } from './global-event-envelope.class';
import type { EventContext } from './event-context.interface';
import type { GlobalEventContext } from './global-event-context.interface';

/** Union of all supported event envelope variants. */
export type AnyEventEnvelope<T = unknown> = EventEnvelope<T> | GlobalEventEnvelope<T>;

/** Union of all supported event context variants. */
export type AnyEventContext = EventContext | GlobalEventContext;

/** Returns true when the envelope is the {@link GlobalEventEnvelope} variant. */
export function isGlobalEnvelope(envelope: AnyEventEnvelope): envelope is GlobalEventEnvelope {
  return !('company_id' in envelope);
}

/** Returns true when the context is the {@link GlobalEventContext} variant. */
export function isGlobalContext(context: AnyEventContext): context is GlobalEventContext {
  return !('companyId' in context);
}
