import { EventEnvelope } from '../common/envelope/event-envelope.class';
import { EventContext } from '../common/envelope/event-context.interface';
import { RequestReplyException } from '../common/errors/request-reply.exception';
import { generateEventId } from '../common/utils/uuid.utils';
import { nowIso } from '../common/utils/date.utils';
import { EventLoggerService, EventLogContext, EventErrorLogContext } from '../logging/event-logger.service';

export function buildEnvelope<T>(context: EventContext, payload: T): EventEnvelope<T> {
  return new EventEnvelope<T>({
    id: generateEventId(),
    produced_at: nowIso(),
    type: context.type,
    version: context.version,
    producer: context.producer,
    company_id: context.companyId,
    actor_type: context.actorType,
    actor_id: context.actorId,
    correlation_id: context.correlationId,
    causation_id: context.causationId,
    trace_id: context.traceId,
    reply_to: context.replyTo,
    data: payload,
  });
}

export function ensureReplyTo(replyTo: string | undefined, correlationId: string): asserts replyTo is string {
  if (!replyTo) {
    throw new RequestReplyException({
      message: `Cannot send response: event missing reply_to field (correlationId: ${correlationId})`,
      eventId: 'unknown',
      eventType: 'unknown',
      correlationId,
    });
  }
}

export function ensureReplyToSet(replyTo: string | undefined): asserts replyTo is string {
  if (!replyTo) {
    throw new RequestReplyException({
      message: 'sendRequest requires reply_to in context',
      eventId: 'unknown',
      eventType: 'unknown',
      correlationId: 'unknown',
    });
  }
}

export function logRequestSent(logger: EventLoggerService, subject: string, envelope: EventEnvelope<unknown>): void {
  logger.logEventEmitted(toLogContext(subject, envelope));
}

export function logReplyReceived(logger: EventLoggerService, subject: string, envelope: EventEnvelope<unknown>): void {
  logger.logEventConsumed(toLogContext(subject, envelope));
}

export function logRequestError(
  logger: EventLoggerService,
  subject: string,
  envelope: EventEnvelope<unknown>,
  error: unknown,
): void {
  logger.logEventError(toErrorLogContext(subject, envelope, error));
}

export function toLogContext(subject: string, envelope: EventEnvelope<unknown>): EventLogContext {
  return {
    eventId: envelope.id,
    eventType: envelope.type,
    subject,
    correlationId: envelope.correlation_id,
    traceId: envelope.trace_id,
  };
}

export function toErrorLogContext(
  subject: string,
  envelope: EventEnvelope<unknown>,
  error: unknown,
): EventErrorLogContext {
  const err = error instanceof Error ? error : new Error(String(error));
  return {
    ...toLogContext(subject, envelope),
    error: err.message,
    stack: err.stack,
  };
}

export function wrapRequestError(envelope: EventEnvelope<unknown>, error: unknown): RequestReplyException {
  if (error instanceof RequestReplyException) {
    return error;
  }
  return new RequestReplyException({
    message: error instanceof Error ? error.message : String(error),
    eventId: envelope.id,
    eventType: envelope.type,
    correlationId: envelope.correlation_id,
    cause: error instanceof Error ? error : undefined,
  });
}
