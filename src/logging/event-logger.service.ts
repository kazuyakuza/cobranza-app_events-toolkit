import { Injectable } from '@nestjs/common';
import * as winston from 'winston';

/**
 * Structured logging service for all event operations across the platform.
 *
 * Wraps Winston to provide consistent, queryable JSON logs for:
 * - Event publishing (logEventEmitted)
 * - Event consumption (logEventConsumed)
 * - Consumer processing errors (logEventError)
 * - Dead Letter Queue routing (logEventDlq)
 *
 * Accepts custom Winston transports via constructor options,
 * enabling microservices to integrate with existing logging infrastructure.
 */
@Injectable()
export class EventLoggerService {
  private readonly logger: winston.Logger;

  /**
   * Creates an EventLoggerService with optional custom Winston configuration.
   *
   * @param options - Optional Winston transports and log level. Defaults to Console transport at `info` level.
   */
  constructor(options?: EventLoggerOptions) {
    this.logger = this.createLogger(options);
  }

  /**
   * Logs a successfully published event.
   *
   * @param context - Event metadata to include in the log entry.
   */
  logEventEmitted(context: EventLogContext): void {
    this.logger.info('Event emitted', { ...context });
  }

  /**
   * Logs a successfully consumed and processed event.
   *
   * @param context - Event metadata to include in the log entry.
   */
  logEventConsumed(context: EventLogContext): void {
    this.logger.info('Event consumed', { ...context });
  }

  /**
   * Logs a consumer processing error that will be routed to DLQ.
   *
   * @param context - Event metadata plus error details.
   */
  logEventError(context: EventErrorLogContext): void {
    this.logger.error('Event processing error', { ...context });
  }

  /**
   * Logs an event that has been forwarded to the Dead Letter Queue.
   *
   * @param context - Event metadata plus error details.
   */
  logEventDlq(context: EventErrorLogContext): void {
    this.logger.warn('Event routed to DLQ', { ...context });
  }

  /**
   * Logs an event that has been persisted to the outbox for later delivery.
   *
   * @param context - Outbox event metadata.
   */
  logOutboxSaved(context: OutboxLogContext): void {
    this.logger.info('Outbox event saved', { ...context });
  }

  /**
   * Logs a successfully processed outbox event.
   *
   * @param context - Outbox event metadata.
   */
  logOutboxProcessed(context: OutboxLogContext): void {
    this.logger.info('Outbox event processed', { ...context });
  }

  /**
   * Logs an outbox processing failure that will be retried.
   *
   * @param context - Outbox event metadata plus error details.
   */
  logOutboxFailed(context: OutboxErrorLogContext): void {
    this.logger.warn('Outbox event processing failed', { ...context });
  }

  /**
   * Logs an outbox event that has been routed to the Dead Letter Queue.
   *
   * @param context - Outbox event metadata plus error details.
   */
  logOutboxDlq(context: OutboxErrorLogContext): void {
    this.logger.warn('Outbox event routed to DLQ', { ...context });
  }

  /**
   * Creates a Winston logger instance from the provided options.
   *
   * Falls back to Console transport at `info` level with JSON format
   * when no options are provided.
   */
  private createLogger(options?: EventLoggerOptions): winston.Logger {
    const transports = options?.transports ?? [new winston.transports.Console()];
    const level = options?.level ?? 'info';
    return winston.createLogger({
      level,
      format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
      transports,
    });
  }
}

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
