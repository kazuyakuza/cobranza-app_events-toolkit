import { EventEnvelope } from '../common/envelope/event-envelope.class';

export interface PublishedEvent {
  subject: string;
  event: EventEnvelope<unknown>;
  timestamp: string;
}
