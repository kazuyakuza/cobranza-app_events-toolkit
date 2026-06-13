import { EventEnvelope } from '../common/envelope/event-envelope.class';
import { EventContext } from '../producer/producer.service';

/** Options for {@link ConsumerService.dispatch}. */
export interface DispatchOptions {
  /** Exact NATS subject of the incoming message. */
  subject: string;
  /** Deserialized and validated event envelope. */
  event: EventEnvelope<unknown>;
  /** Metadata context extracted from the event envelope. */
  context: EventContext;
}
