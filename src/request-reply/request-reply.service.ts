import { Inject, Injectable } from '@nestjs/common';
import { EventEnvelope } from '../common/envelope/event-envelope.class';
import { EventContext } from '../common/envelope/event-context.interface';
import { RequestReplyException } from '../common/errors/request-reply.exception';
import { generateEventId } from '../common/utils/uuid.utils';
import { nowIso } from '../common/utils/date.utils';
import { encodeEvent, decodeEvent } from '../common/utils/serialization.utils';
import { EventLoggerService, EventLogContext, EventErrorLogContext } from '../logging/event-logger.service';
import { ProducerService } from '../producer/producer.service';
import {
  RequestReplyConfig,
  RequestReplyDeps,
  RequestReplyRequestOptions,
  RequestReplyResponse,
  REQUEST_REPLY_DEPS_TOKEN,
  SendRequestOptions,
  SendRequestResult,
  BuildResponseEnvelopeOptions,
} from './request-reply.types';

/**
 * Provides request-reply messaging over NATS JetStream.
 *
 * Complements the fire-and-forget ProducerService by supporting
 * synchronous request-reply semantics where a caller sends a request
 * and waits for a typed response within a timeout window.
 */
@Injectable()
export class RequestReplyService {
  private readonly natsConnection: RequestReplyDeps['natsConnection'];
  private readonly producerService: ProducerService;
  private readonly logger: EventLoggerService;
  private readonly config: RequestReplyConfig;

  constructor(@Inject(REQUEST_REPLY_DEPS_TOKEN) deps: RequestReplyDeps) {
    this.natsConnection = deps.natsConnection;
    this.producerService = deps.producerService;
    this.logger = deps.logger;
    this.config = deps.config;
  }

  /**
   * Sends a request event and waits for a typed reply within a timeout.
   *
   * Builds an {@link EventEnvelope} from the provided context and payload,
   * publishes it via NATS request-reply, and decodes the response envelope.
   */
  async request<T, R>(
    subject: string,
    payload: T,
    options: RequestReplyRequestOptions & { context: EventContext; },
  ): Promise<RequestReplyResponse<R>> {
    const { context, ...requestOptions } = options;
    const envelope = this.buildEnvelope(context, payload);
    const encoded = encodeEvent(envelope);
    const timeout = requestOptions.timeoutMs ?? this.config.defaultTimeoutMs;
    this.logRequestSent(subject, envelope);

    try {
      const msg = await this.natsConnection.request(subject, encoded, { timeout });
      const responseEnvelope = decodeEvent<EventEnvelope<R>>(msg.data);
      this.logReplyReceived(subject, responseEnvelope);
      return { data: responseEnvelope.data, raw: msg.data };
    } catch (error: unknown) {
      this.logRequestError(subject, envelope, error);
      throw this.wrapRequestError(envelope, error);
    }
  }

  /**
   * Publishes a reply event to the subject stored in `reply_to`.
   *
   * The caller must set `reply_to` on `responseEvent` to the original
   * request's `reply_to` value before calling this method.
   */
  async sendResponse(correlationId: string, responseEvent: EventEnvelope<unknown>): Promise<void> {
    const replyTo = responseEvent.reply_to;
    this.ensureReplyTo(replyTo, correlationId);
    await this.producerService.publish(replyTo, responseEvent);
  }

  /** Returns true when the event carries a `reply_to` subject. */
  isRequestReplyMessage(event: EventEnvelope<unknown>): boolean {
    return typeof event.reply_to === 'string' && event.reply_to.length > 0;
  }

  /**
   * Publishes a fire-and-forget request event with a reply_to subject.
   *
   * Builds an envelope from the provided context and payload, publishes
   * it via {@link ProducerService}, and returns the correlationId
   * for the caller to track async responses.
   *
   * @typeParam T - Request payload type.
   */
  async sendRequest<T>(options: SendRequestOptions<T>): Promise<SendRequestResult> {
    this.ensureReplyToSet(options.context.replyTo);
    const envelope = this.buildEnvelope(options.context, options.payload);
    await this.producerService.publish(options.subject, envelope);
    return { correlationId: envelope.correlation_id };
  }

  /**
   * Builds a response envelope preserving correlation and causation from a request event.
   *
   * Overrides responseContext.correlationId with requestEvent.correlation_id
   * and sets causationId to requestEvent.id, then delegates to {@link buildEnvelope}.
   *
   * @typeParam R - Response payload type.
   */
  buildResponseEnvelope<R>(options: BuildResponseEnvelopeOptions<R>): EventEnvelope<R> {
    const preservedContext: EventContext = {
      ...options.responseContext,
      correlationId: options.requestEvent.correlation_id,
      causationId: options.requestEvent.id,
    };
    return this.buildEnvelope(preservedContext, options.responseData);
  }

  private buildEnvelope<T>(context: EventContext, payload: T): EventEnvelope<T> {
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

  private ensureReplyTo(replyTo: string | undefined, correlationId: string): asserts replyTo is string {
    if (!replyTo) {
      throw new RequestReplyException({
        message: `Cannot send response: event missing reply_to field (correlationId: ${correlationId})`,
        eventId: 'unknown',
        eventType: 'unknown',
        correlationId,
      });
    }
  }

  private ensureReplyToSet(replyTo: string | undefined): asserts replyTo is string {
    if (!replyTo) {
      throw new RequestReplyException({
        message: 'sendRequest requires reply_to in context',
        eventId: 'unknown',
        eventType: 'unknown',
        correlationId: 'unknown',
      });
    }
  }

  private logRequestSent(subject: string, envelope: EventEnvelope<unknown>): void {
    this.logger.logEventEmitted(this.toLogContext(subject, envelope));
  }

  private logReplyReceived(subject: string, envelope: EventEnvelope<unknown>): void {
    this.logger.logEventConsumed(this.toLogContext(subject, envelope));
  }

  private logRequestError(subject: string, envelope: EventEnvelope<unknown>, error: unknown): void {
    this.logger.logEventError(this.toErrorLogContext(subject, envelope, error));
  }

  private toLogContext(subject: string, envelope: EventEnvelope<unknown>): EventLogContext {
    return {
      eventId: envelope.id,
      eventType: envelope.type,
      subject,
      correlationId: envelope.correlation_id,
      traceId: envelope.trace_id,
    };
  }

  private toErrorLogContext(subject: string, envelope: EventEnvelope<unknown>, error: unknown): EventErrorLogContext {
    const err = error instanceof Error ? error : new Error(String(error));
    return {
      ...this.toLogContext(subject, envelope),
      error: err.message,
      stack: err.stack,
    };
  }

  private wrapRequestError(envelope: EventEnvelope<unknown>, error: unknown): RequestReplyException {
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
}
