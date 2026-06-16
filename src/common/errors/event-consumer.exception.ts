/**
 * Thrown by event consumers when message processing fails and the message
 * should be routed to the Dead Letter Queue (DLQ).
 *
 * JetStreamConsumerService catches this exception and forwards the failed
 * message to the corresponding DLQ subject:
 *   dlq.company.{company_id}.{domain}.{entity}.{action}.v{version}
 *
 * Optional metadata fields (`dlqReason`, `originalSubject`, `retryCount`)
 * are included in the DLQ payload for observability and debugging.
 *
 * @see docs/event-messaging-convention.md — Section 4.3 (Dead Letter Queue)
 */
export class EventConsumerException extends Error {
  /** Event ID of the message that failed processing. */
  readonly eventId: string;

  /** Event type (dot-notation) of the message that failed processing. */
  readonly eventType: string;

  /** Correlation ID for tracing the failed request chain. Optional. */
  readonly correlationId?: string;

  /** The underlying error that caused the failure. Optional. */
  readonly cause?: Error;

  /** Human-readable reason for DLQ routing. Optional; provides context beyond the error message. */
  readonly dlqReason?: string;

  /** Original NATS subject the message was consumed from. Optional; populated by the consumer service. */
  readonly originalSubject?: string;

  /** Number of delivery attempts before routing to DLQ. Optional. */
  readonly retryCount?: number;

  /**
   * Creates an EventConsumerException with DLQ routing context.
   *
   * @param options - Exception options including event metadata, the underlying cause, and optional DLQ metadata.
   */
  constructor(options: EventConsumerExceptionOptions) {
    super(options.message);
    this.name = 'EventConsumerException';
    this.eventId = options.eventId;
    this.eventType = options.eventType;
    this.correlationId = options.correlationId;
    this.cause = options.cause;
    this.dlqReason = options.dlqReason;
    this.originalSubject = options.originalSubject;
    this.retryCount = options.retryCount;

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, EventConsumerException);
    }
  }
}

/** Options for constructing an {@link EventConsumerException}. */
export interface EventConsumerExceptionOptions {
  /** Human-readable error message describing the failure. */
  message: string;
  /** Event ID of the message that failed processing. */
  eventId: string;
  /** Event type (dot-notation) of the message that failed processing. */
  eventType: string;
  /** Correlation ID for tracing the failed request chain. Optional. */
  correlationId?: string;
  /** The underlying error that caused the failure. Optional. */
  cause?: Error;
  /** Human-readable reason for DLQ routing. Optional. */
  dlqReason?: string;
  /** Original NATS subject the message was consumed from. Optional. */
  originalSubject?: string;
  /** Number of delivery attempts before routing to DLQ. Optional. */
  retryCount?: number;
}
