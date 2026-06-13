import { Inject, Injectable } from '@nestjs/common';
import { EventEnvelope } from '../common/envelope/event-envelope.class';
import { generateEventId } from '../common/utils/uuid.utils';
import { nowIso } from '../common/utils/date.utils';
import { EventLoggerService, EventLogContext } from '../logging/event-logger.service';
import { ProducerService } from '../producer/producer.service';
import {
  RequestReplyConfig,
  RequestReplyDeps,
  RequestReplyOptions,
  RequestReplyResponse,
  REQUEST_REPLY_DEPS_TOKEN,
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
  private readonly encoder = new TextEncoder();
  private readonly decoder = new TextDecoder();
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
   * Builds an {@link EventEnvelope} from the provided options, publishes it
   * via NATS request-reply, and decodes the response envelope payload.
   */
  async request<T, R>(options: RequestReplyOptions<T>): Promise<RequestReplyResponse<R>> {
    const envelope = this.buildEnvelope(options);
    const payload = this.encodeEnvelope(envelope);
    const timeout = options.timeoutMs ?? this.config.defaultTimeoutMs;
    this.logRequestSent(options.subject, envelope);

    const msg = await this.natsConnection.request(options.subject, payload, { timeout });
    const responseEnvelope = this.decodeEnvelope<R>(msg.data);
    this.logReplyReceived(options.subject, envelope);

    return { data: responseEnvelope.data, raw: msg.data };
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
    this.logResponseSent(replyTo, responseEvent);
  }

  /** Returns true when the event carries a `reply_to` subject. */
  isRequestReplyMessage(event: EventEnvelope<unknown>): boolean {
    return typeof event.reply_to === 'string' && event.reply_to.length > 0;
  }

  private buildEnvelope<T>(options: RequestReplyOptions<T>): EventEnvelope<T> {
    const { context, data } = options;
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
      data,
    });
  }

  private encodeEnvelope(envelope: EventEnvelope<unknown>): Uint8Array {
    return this.encoder.encode(JSON.stringify(envelope));
  }

  private decodeEnvelope<R>(raw: Uint8Array): EventEnvelope<R> {
    return JSON.parse(this.decoder.decode(raw)) as EventEnvelope<R>;
  }

  private ensureReplyTo(replyTo: string | undefined, correlationId: string): asserts replyTo is string {
    if (!replyTo) {
      throw new Error(
        `Cannot send response: event missing reply_to field (correlationId: ${correlationId})`,
      );
    }
  }

  private logRequestSent(subject: string, envelope: EventEnvelope<unknown>): void {
    this.logger.logEventEmitted(this.toLogContext(subject, envelope));
  }

  private logReplyReceived(subject: string, envelope: EventEnvelope<unknown>): void {
    this.logger.logEventConsumed(this.toLogContext(subject, envelope));
  }

  private logResponseSent(replyTo: string, envelope: EventEnvelope<unknown>): void {
    this.logger.logEventEmitted({
      eventId: envelope.id,
      eventType: envelope.type,
      subject: replyTo,
      correlationId: envelope.correlation_id,
      traceId: envelope.trace_id,
    });
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
}