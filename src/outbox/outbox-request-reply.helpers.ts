import { EventEnvelope } from '../common/envelope/event-envelope.class';
import { OutboxRequestReplyException } from './outbox-request-reply.exception';

/** Asserts that `event.reply_to` is present; throws otherwise. */
export function ensureReplyToPresent(
  event: EventEnvelope<unknown>,
): asserts event is EventEnvelope<unknown> & { reply_to: string } {
  if (!event.reply_to) {
    throw new OutboxRequestReplyException({
      message: `sendRequestThroughOutbox requires event with reply_to; event ${event.id} (${event.type}) is missing reply_to`,
      eventId: event.id,
      eventType: event.type,
    });
  }
}
