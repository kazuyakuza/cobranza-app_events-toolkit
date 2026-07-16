/**
 * @packageDocumentation
 * Logging module — structured logger service and context types for event and outbox operations.
 */

export {
  EventLoggerService,
  EventLoggerOptions,
  EventLogContext,
  EventErrorLogContext,
  OutboxLogContext,
  OutboxErrorLogContext,
} from './event-logger.service';

// Direct re-export so consumers can import the context types from either path
export type {
  EventLoggerOptions,
  EventLogContext,
  EventErrorLogContext,
  OutboxLogContext,
  OutboxErrorLogContext,
} from './event-logger-context.interface';
