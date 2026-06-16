import { EventEnvelope } from '../common/envelope/event-envelope.class';

/** A recorded event publication captured by `MockProducerService`. */
export interface PublishedEvent {
  /** The NATS subject the event was published to. */
  subject: string;
  /** The full event envelope. */
  event: EventEnvelope<unknown>;
  /** ISO-8601 timestamp of when the event was recorded. */
  timestamp: string;
}
