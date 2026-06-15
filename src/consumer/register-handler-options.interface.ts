import { EventHandler } from './consumer.service';

/**
 * Options for registering a request-reply response handler.
 *
 * Encapsulates the event type, handler function, and optional company filter
 * so that {@link RequestReplyConsumerService.registerHandler} respects the
 * max-2-params rule (single options object instead of multiple positional args).
 */
export interface RegisterHandlerOptions {
  /** Dot-notation event type to match against incoming response envelopes. */
  eventType: string;
  /** Handler function invoked when a matching response is received. */
  handler: EventHandler;
  /**
   * Optional tenant identifier.
   * When set, the handler is only dispatched for responses whose
   * `company_id` matches this value.
   */
  companyId?: string;
}
