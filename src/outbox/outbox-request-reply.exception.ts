/**
 * Thrown when a request-reply outbox operation receives an event
 * that lacks the required `reply_to` field.
 */
export class OutboxRequestReplyException extends Error {
  /** Event ID of the event missing `reply_to`. */
  readonly eventId: string;

  /** Event type (dot-notation) of the event missing `reply_to`. */
  readonly eventType: string;

  /**
   * Creates an OutboxRequestReplyException indicating that a request-reply
   * event could not be processed through the outbox due to a missing `reply_to`.
   */
  constructor(options: OutboxRequestReplyExceptionOptions) {
    super(options.message);
    this.name = 'OutboxRequestReplyException';
    this.eventId = options.eventId;
    this.eventType = options.eventType;

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, OutboxRequestReplyException);
    }
  }
}

/** Options for constructing an {@link OutboxRequestReplyException}. */
export interface OutboxRequestReplyExceptionOptions {
  /** Human-readable error message. */
  message: string;
  /** Event ID of the event missing `reply_to`. */
  eventId: string;
  /** Event type (dot-notation) of the event. */
  eventType: string;
}
