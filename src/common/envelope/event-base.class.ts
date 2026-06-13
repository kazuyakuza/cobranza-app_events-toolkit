import { EventEnvelope } from './event-envelope.class';

/**
 * Abstract base for domain-specific event types.
 *
 * Extends {@link EventEnvelope} and enforces at compile time that every
 * concrete event type MUST define its own `type` and `version` properties.
 *
 * @typeParam T - The domain-specific business payload type.
 *
 * @example
 * ```ts
 * class PaymentProofUploadedEvent extends EventBase<PaymentProofData> {
 *   readonly type = 'payment.proof.uploaded';
 *   readonly version = '1.0.0';
 * }
 * ```
 */
export abstract class EventBase<T = Record<string, unknown>> extends EventEnvelope<T> {
  declare abstract type: string;
  declare abstract version: string;
}
