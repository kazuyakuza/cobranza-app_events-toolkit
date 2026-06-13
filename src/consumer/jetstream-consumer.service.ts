import { Inject, Injectable } from '@nestjs/common';
import { JetStreamClient, JsMsg } from 'nats';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { EventEnvelope } from '../common/envelope/event-envelope.class';
import { EventConsumerException } from '../common/errors/event-consumer.exception';
import { EventLoggerService, EventLogContext, EventErrorLogContext } from '../logging/event-logger.service';
import { ConsumerService } from './consumer.service';
import { DispatchOptions } from './dispatch-options.interface';
import { JetStreamConsumerDeps, JETSTREAM_CONSUMER_DEPS_TOKEN } from './jetstream-consumer-deps.interface';
import {
  SubscribeOptions,
  defaultDlqSubjectBuilder,
  envelopeToContext,
  ValidationErrorOptions,
  ErrorHandlingOptions,
  DlqRoutingOptions,
} from './subscribe-options.interface';

/**
 * Manages JetStream subscriptions and message lifecycle for the Consumer Module.
 *
 * Handles the full consume pipeline: JSON parsing, envelope validation,
 * handler dispatch, ACK/NACK, and DLQ routing on failure.
 * Requires {@link EventLoggerService} to be available globally.
 */
@Injectable()
export class JetStreamConsumerService {
  private readonly encoder = new TextEncoder();
  private readonly jetStream: JetStreamClient;
  private readonly consumerService: ConsumerService;
  private readonly logger: EventLoggerService;
  private readonly dlqSubjectBuilder: (subject: string) => string;

  constructor(@Inject(JETSTREAM_CONSUMER_DEPS_TOKEN) deps: JetStreamConsumerDeps) {
    this.jetStream = deps.jetStream;
    this.consumerService = deps.consumerService;
    this.logger = deps.logger;
    this.dlqSubjectBuilder = deps.dlqSubjectBuilder ?? defaultDlqSubjectBuilder;
  }

  /**
   * Subscribes to a NATS subject and begins consuming messages.
   *
   * Registers the handler in {@link ConsumerService}, creates the JetStream
   * subscription, and starts the async message-processing loop.
   *
   * @param options - Subject pattern, handler function, and optional consumer/DLQ configuration.
   */
  async subscribe(options: SubscribeOptions): Promise<void> {
    this.consumerService.registerHandler(options.subject, options.handler);
    const subscription = await this.jetStream.subscribe(options.subject, options.consumerOpts ?? {});
    this.processSubscription(subscription, options.subject).catch((error: unknown) =>
      this.logGeneralError(error, options.subject),
    );
  }

  /** Processes a single JetStream message. Exposed for testing; use {@link subscribe} in production. */
  async processMessage(msg: JsMsg, subject: string): Promise<void> {
    return this.handleMessage(msg, subject);
  }

  private async processSubscription(subscription: AsyncIterable<JsMsg>, subject: string): Promise<void> {
    for await (const msg of subscription) {
      await this.handleMessage(msg, subject);
    }
  }

  private async handleMessage(msg: JsMsg, subject: string): Promise<void> {
    let plain: Record<string, unknown> | undefined;
    try {
      plain = this.parseMessageData(msg);
      const envelope = this.validateEnvelope(plain, msg.subject);
      const context = envelopeToContext(envelope);
      const logCtx = this.toLogContext(subject, envelope);
      const dispatchOptions: DispatchOptions = { subject, event: envelope, context };
      await this.consumerService.dispatch(dispatchOptions);
      msg.ack();
      this.logger.logEventConsumed(logCtx);
    } catch (error: unknown) {
      await this.handleError({ error, msg, subject, originalPayload: plain });
    }
  }

  private validateEnvelope(plain: Record<string, unknown>, subject: string): EventEnvelope<unknown> {
    const envelope = plainToInstance(EventEnvelope, plain);
    const errors = validateSync(envelope);
    if (errors.length > 0) {
      throw this.createValidationException({ errors, subject, plain });
    }
    return envelope;
  }

  private parseMessageData(msg: JsMsg): Record<string, unknown> {
    const text = new TextDecoder().decode(msg.data);
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new EventConsumerException({
        message: 'Message payload is not valid JSON',
        eventId: 'unknown',
        eventType: 'unknown',
      });
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new EventConsumerException({
        message: 'Message payload is not a valid JSON object',
        eventId: 'unknown',
        eventType: 'unknown',
      });
    }
    return parsed as Record<string, unknown>;
  }

  private createValidationException(options: ValidationErrorOptions): EventConsumerException {
    const { errors, subject, plain } = options;
    const eventId = typeof plain.id === 'string' ? plain.id : 'unknown';
    const eventType = typeof plain.type === 'string' ? plain.type : 'unknown';
    const correlationId = typeof plain.correlation_id === 'string' ? plain.correlation_id : undefined;
    const messages = errors.map((e) => Object.values(e.constraints ?? {}).join('; ')).join(', ');
    return new EventConsumerException({
      message: `Event validation failed on subject ${subject}: ${messages}`,
      eventId,
      eventType,
      correlationId,
      cause: new Error(JSON.stringify(errors)),
    });
  }

  private async handleError(options: ErrorHandlingOptions): Promise<void> {
    if (options.error instanceof EventConsumerException) {
      await this.routeToDlq({
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

  private async routeToDlq(options: DlqRoutingOptions): Promise<void> {
    const { exception, msg, subject, originalPayload } = options;
    const dlqSubject = this.dlqSubjectBuilder(subject);
    const errorCtx = this.exceptionToErrorContext(exception, subject);
    this.logger.logEventDlq(errorCtx);
    const dlqPayload = {
      originalSubject: subject,
      originalPayload: originalPayload ?? {},
      error: {
        name: exception.name,
        message: exception.message,
        eventId: exception.eventId,
        eventType: exception.eventType,
        correlationId: exception.correlationId,
        stack: exception.stack,
      },
      failedAt: new Date().toISOString(),
    };
    try {
      await this.jetStream.publish(dlqSubject, this.encoder.encode(JSON.stringify(dlqPayload)));
      msg.ack();
    } catch (publishError: unknown) {
      this.logGeneralError(publishError, subject);
      msg.nak();
    }
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

  private exceptionToErrorContext(exception: EventConsumerException, subject: string): EventErrorLogContext {
    return {
      eventId: exception.eventId,
      eventType: exception.eventType,
      subject,
      correlationId: exception.correlationId,
      error: exception.message,
      stack: exception.stack,
    };
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
