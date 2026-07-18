import type { EventEnvelope } from './event-envelope.class';
import type { GlobalEventEnvelope } from './global-event-envelope.class';
import type { EventContext } from './event-context.interface';
import type { GlobalEventContext } from './global-event-context.interface';

/**
 * Union of all supported event envelope variants.
 *
 * Use this type when a function or method must accept both tenant-scoped
 * ({@link EventEnvelope}) and tenant-less ({@link GlobalEventEnvelope}) envelopes.
 * Pair with {@link isGlobalEnvelope} to narrow the variant at runtime.
 *
 * @typeParam T - The domain-specific business payload type.
 */
export type AnyEventEnvelope<T = unknown> = EventEnvelope<T> | GlobalEventEnvelope<T>;

/**
 * Union of all supported event context variants.
 *
 * Use this type when a function or method must accept both tenant-scoped
 * ({@link EventContext}) and tenant-less ({@link GlobalEventContext}) contexts.
 * Pair with {@link isGlobalContext} to narrow the variant at runtime.
 */
export type AnyEventContext = EventContext | GlobalEventContext;

/**
 * Type guard that returns `true` when the envelope is the {@link GlobalEventEnvelope} variant.
 *
 * Detection is based on the absence of the `company_id` field, which is present
 * only on tenant-scoped envelopes.
 *
 * @param envelope - Any event envelope (tenant or global).
 * @returns `true` if the envelope is a {@link GlobalEventEnvelope}.
 *
 * @example
 * ```ts
 * if (isGlobalEnvelope(envelope)) {
 *   // envelope is narrowed to GlobalEventEnvelope
 * }
 * ```
 */
export function isGlobalEnvelope(envelope: AnyEventEnvelope): envelope is GlobalEventEnvelope {
  return !('company_id' in envelope);
}

/**
 * Type guard that returns `true` when the context is the {@link GlobalEventContext} variant.
 *
 * Detection is based on the absence of the `companyId` field, which is present
 * only on tenant-scoped contexts.
 *
 * @param context - Any event context (tenant or global).
 * @returns `true` if the context is a {@link GlobalEventContext}.
 *
 * @example
 * ```ts
 * if (isGlobalContext(context)) {
 *   // context is narrowed to GlobalEventContext
 * }
 * ```
 */
export function isGlobalContext(context: AnyEventContext): context is GlobalEventContext {
  return !('companyId' in context);
}
