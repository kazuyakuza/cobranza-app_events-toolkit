import { AnyEventEnvelope } from '../common/envelope/envelope-types';
import { OutboxLogContext, OutboxErrorLogContext, EventLoggerService } from '../logging/event-logger.service';
import { OutboxEntry } from './outbox.types';
import { OutboxErrorContextParams } from './outbox-error-context-params.interface';
import { parseEnvelope } from './outbox.utils';

/** Logs a structured "outbox saved" message for the given event. */
export function logOutboxSaved(params: {
  event: AnyEventEnvelope<unknown>;
  subject: string;
  logger: EventLoggerService;
}): void {
  const { event, subject, logger } = params;
  logger.logOutboxSaved({
    eventId: event.id,
    eventType: event.type,
    subject,
    attempt: 0,
    correlationId: event.correlation_id,
    traceId: event.trace_id,
  });
}

/** Builds a log context object from an outbox entry for success/failure logging. */
export function toOutboxLogContext(entry: OutboxEntry): OutboxLogContext {
  const envelope = parseEnvelope(entry);
  return {
    eventId: entry.id,
    eventType: envelope.type,
    subject: entry.subject,
    attempt: entry.attempts + 1,
    correlationId: envelope.correlation_id,
    traceId: envelope.trace_id,
  };
}

/** Builds an error log context from an outbox entry, attempt number, and error. */
export function toOutboxErrorLogContext(params: OutboxErrorContextParams): OutboxErrorLogContext {
  const { entry, attempt, error } = params;
  const err = error instanceof Error ? error : new Error(String(error));
  return {
    ...toOutboxLogContext(entry),
    attempt,
    error: err.message,
    stack: err.stack,
  };
}

/** Logs a processor-level error when the background poller encounters an unexpected failure. */
export function logProcessorError(params: { error: unknown; logger: EventLoggerService }): void {
  const { error, logger } = params;
  const err = error instanceof Error ? error : new Error(String(error));
  logger.logEventError({
    eventId: 'unknown',
    eventType: 'unknown',
    subject: 'outbox-processor',
    error: err.message,
    stack: err.stack,
  });
}
