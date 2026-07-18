import type { GlobalEventContext } from '../common/envelope/global-event-context.interface';

/**
 * GlobalEventContext with `replyTo` required — used by async request-reply
 * operations through the outbox that publish GLOBAL request events.
 */
export interface AsyncGlobalRequestEventContext extends GlobalEventContext {
  /** NATS subject for async request-reply response routing. */
  replyTo: string;
}
