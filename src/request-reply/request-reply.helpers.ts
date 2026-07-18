import { GlobalEventContext } from '../common/envelope/global-event-context.interface';
import { GlobalEventEnvelope } from '../common/envelope/global-event-envelope.class';
import { AnyEventEnvelope } from '../common/envelope/envelope-types';
import { EventEnvelope } from '../common/envelope/event-envelope.class';
import { EventContext } from '../common/envelope/event-context.interface';
import { RequestReplyException } from '../common/errors/request-reply.exception';
import { generateEventId } from '../common/utils/uuid.utils';
import { nowIso } from '../common/utils/date.utils';
import { EventLoggerService, EventLogContext, EventErrorLogContext } from '../logging/event-logger.service';

/** Builds a fully-populated tenant {@link EventEnvelope} from domain context and payload. */
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

/** Builds a fully-populated global {@link GlobalEventEnvelope} from domain context and payload. */
export function buildGlobalEnvelope<T>(context: GlobalEventContext, payload: T): GlobalEventEnvelope<T> {
  return new GlobalEventEnvelope<T>({
    id: generateEventId(),
    produced_at: nowIso(),
    type: context.type,
    version: context.version,
    producer: context.producer,
    actor_type: context.actorType,
    actor_id: context.actorId,
    correlation_id: context.correlationId,
    causation_id: context.causationId,
    trace_id: context.traceId,
    reply_to: context.replyTo,
    data: payload,
  });
}

/** Asserts that `replyTo` is present; throws {@link RequestReplyException} otherwise. */
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

/** Asserts that `replyTo` is set on a request context; throws {@link RequestReplyException} otherwise. */
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

/** Logs that a request event was emitted to the given subject. */
export function logRequestSent(logger: EventLoggerService, subject: string, envelope: AnyEventEnvelope<unknown>): void {
  logger.logEventEmitted(toLogContext(subject, envelope));
}

/** Logs that a reply event was received from the given subject. */
export function logReplyReceived(logger: EventLoggerService, subject: string, envelope: AnyEventEnvelope<unknown>): void {
  logger.logEventConsumed(toLogContext(subject, envelope));
}

/** Logs an error that occurred during a request-reply exchange. */
export function logRequestError(
  logger: EventLoggerService,
  subject: string,
  envelope: AnyEventEnvelope<unknown>,
  error: unknown,
): void {
  logger.logEventError(toErrorLogContext(subject, envelope, error));
}

/** Converts a subject and envelope into an {@link EventLogContext} for structured logging. */
export function toLogContext(subject: string, envelope: AnyEventEnvelope<unknown>): EventLogContext {
  return {
    eventId: envelope.id,
    eventType: envelope.type,
    subject,
    correlationId: envelope.correlation_id,
    traceId: envelope.trace_id,
  };
}

/** Converts a subject, envelope, and error into an {@link EventErrorLogContext} for structured logging. */
export function toErrorLogContext(
  subject: string,
  envelope: AnyEventEnvelope<unknown>,
  error: unknown,
): EventErrorLogContext {
  const err = error instanceof Error ? error : new Error(String(error));
  return {
    ...toLogContext(subject, envelope),
    error: err.message,
    stack: err.stack,
  };
}

/** Wraps an unknown error into a {@link RequestReplyException}, preserving the original if already typed. */
export function wrapRequestError(envelope: AnyEventEnvelope<unknown>, error: unknown): RequestReplyException {
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
