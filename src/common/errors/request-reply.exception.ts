/**
 * Thrown by RequestReplyService when a request-reply operation fails.
 *
 * Carries enough context for error logging, DLQ routing, and
 * distributed-tracing correlation.
 */
export class RequestReplyException extends Error {
  /** Event ID of the request that failed. */
  readonly eventId: string;

  /** Event type (dot-notation) of the request that failed. */
  readonly eventType: string;

  /** Correlation ID for tracing the request chain. Optional. */
  readonly correlationId?: string;

  /** The underlying error that caused the failure. Optional. */
  readonly cause?: Error;

  /**
   * Creates a RequestReplyException with request-reply context.
   *
   * @param options - Exception options including request metadata and the underlying cause.
   */
  constructor(options: RequestReplyExceptionOptions) {
    super(options.message);
    this.name = 'RequestReplyException';
    this.eventId = options.eventId;
    this.eventType = options.eventType;
    this.correlationId = options.correlationId;
    this.cause = options.cause;

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, RequestReplyException);
    }
  }
}

/** Options for constructing a {@link RequestReplyException}. */
export interface RequestReplyExceptionOptions {
  /** Human-readable error message describing the failure. */
  message: string;
  /** Event ID of the request that failed. */
  eventId: string;
  /** Event type (dot-notation) of the request that failed. */
  eventType: string;
  /** Correlation ID for tracing the request chain. Optional. */
  correlationId?: string;
  /** The underlying error that caused the failure. Optional. */
  cause?: Error;
}
