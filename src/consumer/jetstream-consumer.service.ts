import { Inject, Injectable } from '@nestjs/common';
import { JetStreamClient, JsMsg } from 'nats';
import { StreamAutoCreator } from './stream-auto-creator';
import { createStreamAutoCreator, ensureStreamExists } from './consumer-stream.utils';
import { AnyEventEnvelope } from '../common/envelope/envelope-types';
import { EventConsumerException } from '../common/errors/event-consumer.exception';
import { EventLoggerService, EventLogContext } from '../logging/event-logger.service';
import { ConsumerService } from './consumer.service';
import { ConsumerDlqHandler } from './consumer-dlq.handler';
import { DispatchOptions } from './dispatch-options.interface';
import { JetStreamConsumerDeps, JETSTREAM_CONSUMER_DEPS_TOKEN } from './jetstream-consumer-deps.interface';
import {
  SubscribeOptions,
  defaultDlqSubjectBuilder,
  envelopeToContext,
  ErrorHandlingOptions,
} from './subscribe-options.interface';
import { resolveSubscriptionConsumerOpts } from './consumer-opts-merger';
import { GatewayConsumerOptions } from './gateway-consumer-options.interface';
import { MoveToDlqOptions } from './move-to-dlq-options.interface';
import { EnvelopeValidationUtil } from './envelope-validation.util';

/**
 * Manages JetStream subscriptions and message lifecycle for the Consumer Module.
 *
 * Handles the full consume pipeline: JSON parsing, envelope validation,
 * handler dispatch, ACK/NACK, and DLQ routing on failure.
 */
@Injectable()
export class JetStreamConsumerService {
  private readonly jetStream: JetStreamClient;
  private readonly consumerService: ConsumerService;
  private readonly logger: EventLoggerService;
  private readonly dlqSubjectBuilder: (subject: string) => string;
  private readonly dlqHandler: ConsumerDlqHandler;
  private readonly streamAutoCreator?: StreamAutoCreator;
  private readonly gatewayConsumerOpts?: GatewayConsumerOptions;

  constructor(@Inject(JETSTREAM_CONSUMER_DEPS_TOKEN) deps: JetStreamConsumerDeps) {
    this.jetStream = deps.jetStream;
    this.consumerService = deps.consumerService;
    this.logger = deps.logger;
    this.dlqSubjectBuilder = deps.dlqSubjectBuilder ?? defaultDlqSubjectBuilder;
    this.gatewayConsumerOpts = deps.gatewayConsumerOpts;
    this.dlqHandler = new ConsumerDlqHandler({
      jetStream: this.jetStream,
      logger: this.logger,
      dlqSubjectBuilder: this.dlqSubjectBuilder,
    });
    this.streamAutoCreator = createStreamAutoCreator(deps);
  }

  async subscribe(options: SubscribeOptions): Promise<void> {
    this.consumerService.registerHandler(options.subject, options.handler);
    await ensureStreamExists(this.streamAutoCreator, options.subject);
    const consumerOpts = resolveSubscriptionConsumerOpts(this.gatewayConsumerOpts, options.consumerOpts);
    const subscription = await this.jetStream.subscribe(options.subject, consumerOpts);
    this.processSubscription(subscription, options.subject).catch((error: unknown) =>
      this.logGeneralError(error, options.subject),
    );
  }

  /** Processes a single JetStream message. Exposed for testing; use {@link subscribe} in production. */
  async processMessage(msg: JsMsg, subject: string): Promise<void> {
    return this.handleMessage(msg, subject);
  }

  /**
   * Manually routes a JetStream message to the Dead Letter Queue.
   */
  async moveToDlq(options: MoveToDlqOptions): Promise<void> {
    return this.dlqHandler.moveToDlq(options);
  }

  private async processSubscription(subscription: AsyncIterable<JsMsg>, subject: string): Promise<void> {
    for await (const msg of subscription) {
      await this.handleMessage(msg, subject);
    }
  }

  private async handleMessage(msg: JsMsg, subject: string): Promise<void> {
    let plain: Record<string, unknown> | undefined;
    try {
      plain = EnvelopeValidationUtil.parseMessageData(msg);
      const envelope = EnvelopeValidationUtil.validateEnvelope(plain, msg.subject);
      const context = envelopeToContext(envelope, msg.subject);
      const logCtx = this.toLogContext(subject, envelope);
      const dispatchOptions: DispatchOptions = { subject, event: envelope, context };
      await this.consumerService.dispatch(dispatchOptions);
      msg.ack();
      try {
        this.logger.logEventConsumed(logCtx);
      } catch (logError: unknown) {
        this.logGeneralError(logError, subject);
      }
    } catch (error: unknown) {
      await this.handleError({ error, msg, subject, originalPayload: plain });
    }
  }

  private async handleError(options: ErrorHandlingOptions): Promise<void> {
    if (options.error instanceof EventConsumerException) {
      await this.dlqHandler.routeToDlq({
        exception: options.error,
        msg: options.msg,
        subject: options.subject,
        originalPayload: options.originalPayload,
      });
      return;
    }
    options.msg.nak();
    this.logGeneralError(options.error, options.subject);
  }

  private logGeneralError(error: unknown, subject: string): void {
    const err = error instanceof Error ? error : new Error(String(error));
    this.logger.logEventError({
      eventId: 'unknown',
      eventType: 'unknown',
      subject,
      error: err.message,
      stack: err.stack,
    });
  }

  private toLogContext(subject: string, envelope: AnyEventEnvelope<unknown>): EventLogContext {
    return {
      eventId: envelope.id,
      eventType: envelope.type,
      subject,
      correlationId: envelope.correlation_id,
      traceId: envelope.trace_id,
    };
  }
}
