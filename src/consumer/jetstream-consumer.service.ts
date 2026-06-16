import { Inject, Injectable } from '@nestjs/common';
import { JetStreamClient, JsMsg } from 'nats';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { EventEnvelope } from '../common/envelope/event-envelope.class';
import { EventConsumerException } from '../common/errors/event-consumer.exception';
import { encodeEvent } from '../common/utils/serialization.utils';
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
import { MoveToDlqOptions } from './move-to-dlq-options.interface';

/**
 * Manages JetStream subscriptions and message lifecycle for the Consumer Module.
 *
 * Handles the full consume pipeline: JSON parsing, envelope validation,
 * handler dispatch, ACK/NACK, and DLQ routing on failure.
 * Requires {@link EventLoggerService} to be available globally.
 */
@Injectable()
export class JetStreamConsumerService {
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

  /**
   * Manually routes a JetStream message to the Dead Letter Queue.
   *
   * Use when a consumer needs to explicitly move a message to the DLQ
   * outside the automatic exception-handling flow (e.g., after custom retry logic).
   *
   * @param options - Message, reason, and optional subject/payload for DLQ routing.
   */
  async moveToDlq(options: MoveToDlqOptions): Promise<void> {
    const subject = options.subject ?? options.message.subject;
    const dlqSubject = this.dlqSubjectBuilder(subject);
    const dlqPayload = this.buildManualDlqPayload(subject, options);
    await this.publishDlqOrNak(dlqSubject, dlqPayload, options.message, subject);
  }

  /** Builds a DLQ payload for manual routing via {@link moveToDlq}. */
  private buildManualDlqPayload(subject: string, options: MoveToDlqOptions): Record<string, unknown> {
    return {
      originalSubject: subject,
      originalPayload: options.originalPayload ?? {},
      error: {
        name: 'ManualDLQRouting',
        message: options.reason,
      },
      failedAt: new Date().toISOString(),
    };
  }

  /** Publishes a DLQ payload; naks the message if publish fails. */
  private async publishDlqOrNak(
    dlqSubject: string,
    dlqPayload: Record<string, unknown>,
    msg: JsMsg,
    originalSubject: string,
  ): Promise<void> {
    try {
      await this.jetStream.publish(dlqSubject, encodeEvent(dlqPayload));
      msg.ack();
    } catch (publishError: unknown) {
      this.logGeneralError(publishError, originalSubject);
      msg.nak();
    }
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
      try {
        this.logger.logEventConsumed(logCtx);
      } catch (logError: unknown) {
        this.logGeneralError(logError, subject);
      }
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
    if (this.isInvalidEventPayload(parsed)) {
      throw new EventConsumerException({
        message: 'Message payload is not a valid JSON object',
        eventId: 'unknown',
        eventType: 'unknown',
      });
    }
    return parsed as Record<string, unknown>;
  }

  /** Returns true when the parsed payload is not a plain JSON object (null, array, or primitive). */
  private isInvalidEventPayload(parsed: unknown): boolean {
    return typeof parsed !== 'object' || parsed === null || Array.isArray(parsed);
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
    const dlqPayload = this.buildExceptionDlqPayload(subject, exception, originalPayload);
    await this.publishDlqOrNak(dlqSubject, dlqPayload, msg, subject);
  }

  /** Builds a DLQ payload from an {@link EventConsumerException}, including optional metadata. */
  private buildExceptionDlqPayload(
    subject: string,
    exception: EventConsumerException,
    originalPayload?: Record<string, unknown>,
  ): Record<string, unknown> {
    const errorInfo = this.buildErrorInfo(exception);
    return {
      originalSubject: exception.originalSubject ?? subject,
      originalPayload: originalPayload ?? {},
      error: errorInfo,
      failedAt: new Date().toISOString(),
    };
  }

  /** Extracts error info from an {@link EventConsumerException}, including optional DLQ metadata. */
  private buildErrorInfo(exception: EventConsumerException): Record<string, unknown> {
    const info: Record<string, unknown> = {
      name: exception.name,
      message: exception.message,
      eventId: exception.eventId,
      eventType: exception.eventType,
      correlationId: exception.correlationId,
      stack: exception.stack,
    };
    if (exception.dlqReason !== undefined) {
      info.dlqReason = exception.dlqReason;
    }
    if (exception.retryCount !== undefined) {
      info.retryCount = exception.retryCount;
    }
    return info;
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
      dlqReason: exception.dlqReason,
      retryCount: exception.retryCount,
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
