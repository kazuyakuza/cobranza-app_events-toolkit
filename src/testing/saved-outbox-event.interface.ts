import { AnyEventEnvelope } from '../common/envelope/envelope-types';

/** A recorded outbox event captured by `MockOutboxService`. */
export interface SavedOutboxEvent {
  /** The full event envelope saved to the outbox (tenant or global). */
  event: AnyEventEnvelope<unknown>;
  /** The NATS subject associated with the outbox entry. */
  subject: string;
}
