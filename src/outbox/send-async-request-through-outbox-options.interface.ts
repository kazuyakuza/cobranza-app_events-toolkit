import type { AsyncRequestEventContext } from './async-request-event-context.interface';
import type { AsyncGlobalRequestEventContext } from './async-global-request-event-context.interface';

/**
 * Options for {@link OutboxService.sendAsyncRequestThroughOutbox}.
 *
 * Accepts subject, payload, and context (with required `replyTo`)
 * to build and persist a request-reply event through the outbox.
 */
export interface SendAsyncRequestThroughOutboxOptions<T> {
  /** NATS subject to publish the request event to. */
  subject: string;
  /** Domain-specific business payload for the request event. */
  payload: T;
  /** Metadata for the event envelope. Must include replyTo for async responses. */
  context: AsyncRequestEventContext | AsyncGlobalRequestEventContext;
}
