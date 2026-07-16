import { Injectable, Optional } from '@nestjs/common';
import * as winston from 'winston';
import {
  EventLoggerOptions,
  EventLogContext,
  EventErrorLogContext,
  OutboxLogContext,
  OutboxErrorLogContext,
} from './event-logger-context.interface';

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
  constructor(@Optional() options?: EventLoggerOptions) {
    this.logger = this.createLogger(options);
  }

  /**
   * Logs the generated service discovery manifest.
   *
   * @param manifest - The service manifest data to log.
   */
  logDiscoveryManifest(manifest: Record<string, unknown>): void {
    this.logger.info('Discovery manifest generated', { manifest });
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
   * Logs a generic informational message with arbitrary structured metadata.
   *
   * Use for lifecycle events that don't fit specialized `logEvent*` / `logOutbox*` shapes
   * (e.g. JetStream stream auto-creation with custom overrides).
   *
   * @param message - Human-readable log message.
   * @param meta - Optional structured metadata merged into the log entry.
   */
  logInfo(message: string, meta?: Record<string, unknown>): void {
    this.logger.info(message, meta);
  }

  /**
   * Logs a generic error message with arbitrary structured metadata.
   *
   * Use for failures that don't map to the event/DLQ domain (e.g. NATS server rejecting
   * a stream auto-creation request).
   *
   * @param message - Human-readable log message.
   * @param meta - Optional structured metadata merged into the log entry.
   */
  logError(message: string, meta?: Record<string, unknown>): void {
    this.logger.error(message, meta);
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

export {
  EventLoggerOptions,
  EventLogContext,
  EventErrorLogContext,
  OutboxLogContext,
  OutboxErrorLogContext,
} from './event-logger-context.interface';
