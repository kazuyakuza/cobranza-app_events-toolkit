import * as winston from 'winston';

/** Configuration options for {@link EventLoggerService}. */
export interface EventLoggerOptions {
  /** Winston transports. Defaults to Console if not provided. */
  transports?: winston.transport[];
  /** Minimum log level. Defaults to `'info'`. */
  level?: string;
}

/** Metadata context for standard event log entries. */
export interface EventLogContext {
  /** Unique event identifier. */
  eventId: string;
  /** Event type in dot-notation. */
  eventType: string;
  /** NATS subject the event was published/consumed on. */
  subject: string;
  /** Correlation ID for request chain tracing. Optional. */
  correlationId?: string;
  /** OpenTelemetry trace ID. Optional. */
  traceId?: string;
}

/** Metadata context for error and DLQ event log entries. */
export interface EventErrorLogContext extends EventLogContext {
  /** Error message describing the failure. */
  error: string;
  /** Stack trace of the underlying error. Optional. */
  stack?: string;
  /** Human-readable reason for DLQ routing. Optional. */
  dlqReason?: string;
  /** Number of delivery attempts before routing to DLQ. Optional. */
  retryCount?: number;
}

/** Metadata context for outbox event log entries. */
export interface OutboxLogContext {
  /** Unique event identifier. */
  eventId: string;
  /** Event type in dot-notation. */
  eventType: string;
  /** NATS subject the event will be published to. */
  subject: string;
  /** Current delivery attempt number (0 for initial save). */
  attempt: number;
  /** Correlation ID for request chain tracing. Optional. */
  correlationId?: string;
  /** OpenTelemetry trace ID. Optional. */
  traceId?: string;
}

/** Metadata context for outbox error and DLQ event log entries. */
export interface OutboxErrorLogContext extends OutboxLogContext {
  /** Error message describing the failure. */
  error: string;
  /** Stack trace of the underlying error. Optional. */
  stack?: string;
}
