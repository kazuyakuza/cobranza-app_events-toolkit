import { GlobalEventEnvelope } from './global-event-envelope.class';

/**
 * Abstract base for domain-specific **global** event types.
 *
 * Mirror of {@link EventBase} for the {@link GlobalEventEnvelope} variant.
 * Concrete subclasses MUST define `type` and `version`.
 *
 * @typeParam T - The domain-specific business payload type.
 *
 * @example
 * ```ts
 * class CompanyCreatedEvent extends GlobalEventBase<CompanyCreatedData> {
 *   readonly type = 'iam.company.created';
 *   readonly version = '1.0.0';
 * }
 * ```
 */
export abstract class GlobalEventBase<T = Record<string, unknown>> extends GlobalEventEnvelope<T> {
  declare abstract type: string;
  declare abstract version: string;
}
