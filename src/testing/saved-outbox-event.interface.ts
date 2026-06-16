import { EventEnvelope } from '../common/envelope/event-envelope.class';

/** A recorded outbox event captured by `MockOutboxService`. */
export interface SavedOutboxEvent {
  /** The full event envelope saved to the outbox. */
  event: EventEnvelope<unknown>;
  /** The NATS subject associated with the outbox entry. */
  subject: string;
}
