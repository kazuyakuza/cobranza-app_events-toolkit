import type { EventContext } from '../common/envelope/event-context.interface';

/**
 * EventContext with `replyTo` required.
 *
 * Used by async request-reply operations through the outbox where
 * the reply subject must always be present for response routing.
 */
export interface AsyncRequestEventContext extends EventContext {
  /** NATS subject for async request-reply response routing. */
  replyTo: string;
}
