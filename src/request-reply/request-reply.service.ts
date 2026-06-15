import { Inject, Injectable } from '@nestjs/common';
import { EventEnvelope } from '../common/envelope/event-envelope.class';
import { EventContext } from '../common/envelope/event-context.interface';
import { encodeEvent, decodeEvent } from '../common/utils/serialization.utils';
import { EventLoggerService } from '../logging/event-logger.service';
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
import {
  buildEnvelope,
  ensureReplyTo,
  ensureReplyToSet,
  logRequestSent,
  logReplyReceived,
  logRequestError,
  wrapRequestError,
} from './request-reply.helpers';

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
    options: RequestReplyRequestOptions & { context: EventContext },
  ): Promise<RequestReplyResponse<R>> {
    const { context, ...requestOptions } = options;
    const envelope = buildEnvelope(context, payload);
    const encoded = encodeEvent(envelope);
    const timeout = requestOptions.timeoutMs ?? this.config.defaultTimeoutMs;
    logRequestSent(this.logger, subject, envelope);

    try {
      const msg = await this.natsConnection.request(subject, encoded, { timeout });
      const responseEnvelope = decodeEvent<EventEnvelope<R>>(msg.data);
      logReplyReceived(this.logger, subject, responseEnvelope);
      return { data: responseEnvelope.data, raw: msg.data };
    } catch (error: unknown) {
      logRequestError(this.logger, subject, envelope, error);
      throw wrapRequestError(envelope, error);
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
    ensureReplyTo(replyTo, correlationId);
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
    ensureReplyToSet(options.context.replyTo);
    const envelope = buildEnvelope(options.context, options.payload);
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
    return buildEnvelope(preservedContext, options.responseData);
  }
}
