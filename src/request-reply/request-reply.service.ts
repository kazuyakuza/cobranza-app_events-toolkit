import { Inject, Injectable } from '@nestjs/common';
import { AnyEventEnvelope, AnyEventContext } from '../common/envelope/envelope-types';
import { EventContext } from '../common/envelope/event-context.interface';
import { GlobalEventContext } from '../common/envelope/global-event-context.interface';
import { encodeEvent, decodeEvent } from '../common/utils/serialization.utils';
import { EventLoggerService } from '../logging/event-logger.service';
import { ProducerService } from '../producer/producer.service';
import { isGlobalContext } from '../common/envelope/envelope-types';
import {
  RequestReplyConfig,
  RequestReplyDeps,
  RequestReplyRequestOptions,
  RequestReplyResponse,
  REQUEST_REPLY_DEPS_TOKEN,
  SendRequestOptions,
  SendRequestResult,
  BuildResponseEnvelopeOptions,
  DEFAULT_INBOX_PATTERN,
} from './request-reply.types';
import {
  buildEnvelope,
  buildGlobalEnvelope,
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
  private readonly inboxRegex: RegExp;

  constructor(@Inject(REQUEST_REPLY_DEPS_TOKEN) deps: RequestReplyDeps) {
    this.natsConnection = deps.natsConnection;
    this.producerService = deps.producerService;
    this.logger = deps.logger;
    this.config = deps.config;
    this.inboxRegex = new RegExp(this.config.coreNatsFallbackPattern ?? DEFAULT_INBOX_PATTERN);
  }

  /**
   * Sends a request event and waits for a typed reply within a timeout.
   *
   * Builds an EventEnvelope or GlobalEventEnvelope from the provided
   * context and payload, publishes it via NATS request-reply,
   * and decodes the response envelope.
   */
  async request<T, R>(
    subject: string,
    payload: T,
    options: RequestReplyRequestOptions & {
      context: GlobalEventContext | EventContext;
    },
  ): Promise<RequestReplyResponse<R>> {
    const { context, ...requestOptions } = options;
    const envelope = isGlobalContext(context) ? buildGlobalEnvelope(context, payload) : buildEnvelope(context, payload);
    const encoded = encodeEvent(envelope);
    const timeout = requestOptions.timeoutMs ?? this.config.defaultTimeoutMs;
    logRequestSent(this.logger, subject, envelope);

    try {
      const msg = await this.natsConnection.request(subject, encoded, { timeout });
      const responseEnvelope = decodeEvent<AnyEventEnvelope<R>>(msg.data);
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
   * When `fallbackToCoreNatsOnInbox` is enabled and `reply_to` matches the INBOX
   * pattern, publishes via core NATS (no PubAck) instead of JetStream.
   */
  async sendResponse(correlationId: string, responseEvent: AnyEventEnvelope<unknown>): Promise<void> {
    const replyTo = responseEvent.reply_to;
    ensureReplyTo(replyTo, correlationId);

    if (this.shouldUseCoreNats(replyTo)) {
      this.publishToInbox(replyTo, responseEvent);
      return;
    }

    await this.producerService.publish(replyTo, responseEvent);
  }

  /** Returns true when the reply_to subject matches the configured INBOX pattern and fallback is enabled. */
  private shouldUseCoreNats(replyTo: string): boolean {
    if (!this.config.fallbackToCoreNatsOnInbox) {
      return false;
    }
    return this.inboxRegex.test(replyTo);
  }

  /** Publishes the response event via core NATS (no PubAck) to an INBOX subject. */
  private publishToInbox(replyTo: string, responseEvent: AnyEventEnvelope<unknown>): void {
    const payload = encodeEvent(responseEvent);
    this.natsConnection.publish(replyTo, payload);
    logRequestSent(this.logger, replyTo, responseEvent);
  }

  /** Returns true when the event carries a `reply_to` subject. */
  isRequestReplyMessage(event: AnyEventEnvelope<unknown>): boolean {
    return typeof event.reply_to === 'string' && event.reply_to.length > 0;
  }

  /**
   * Publishes a fire-and-forget request event with a reply_to subject.
   */
  async sendRequest<T>(options: SendRequestOptions<T>): Promise<SendRequestResult> {
    ensureReplyToSet(options.context.replyTo);
    const envelope = isGlobalContext(options.context)
      ? buildGlobalEnvelope(options.context, options.payload)
      : buildEnvelope(options.context, options.payload);
    await this.producerService.publish(options.subject, envelope);
    return { correlationId: envelope.correlation_id };
  }

  /**
   * Builds a response envelope preserving correlation and causation from a request event.
   */
  buildResponseEnvelope<R>(options: BuildResponseEnvelopeOptions<R>): AnyEventEnvelope<R> {
    const preservedContext: AnyEventContext = {
      ...options.responseContext,
      correlationId: options.requestEvent.correlation_id,
      causationId: options.requestEvent.id,
    };
    return isGlobalContext(preservedContext)
      ? buildGlobalEnvelope(preservedContext, options.responseData)
      : buildEnvelope(preservedContext, options.responseData);
  }
}
