import { EventEnvelope } from '../common/envelope/event-envelope.class';

export interface SavedOutboxEvent {
  event: EventEnvelope<unknown>;
  subject: string;
}
