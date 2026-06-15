import { JsMsg } from 'nats';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { EventEnvelope } from '../common/envelope/event-envelope.class';
import { EventConsumerException } from '../common/errors/event-consumer.exception';
import { encodeEvent } from '../common/utils/serialization.utils';
import {
  EventLoggerService,
  EventLogContext,
  EventErrorLogContext,
} from '../logging/event-logger.service';
import { DispatchOptions } from './dispatch-options.interface';
import { envelopeToContext, ValidationErrorOptions, DlqRoutingOptions } from './subscribe-options.interface';

/** Dependencies required by {@link RequestReplyMessageProcessor}. */
export interface MessageProcessorDeps {
  /** NATS JetStream client used to publish messages to the Dead Letter Queue. */
  jetStream: { publish: (subject: string, data: Uint8Array) => Promise<unknown>; };
  /** Logger for structured event logging (consumed, errors, DLQ). */
  logger: EventLoggerService;
  /** Builds the DLQ subject from the original message subject. */
  dlqSubjectBuilder: (subject: string) => string;
  /** Dispatches a validated event envelope to the matching registered handler. */
  dispatch: (options: DispatchOptions) => Promise<void>;
}
/** Handles the NATS message processing pipeline for request-reply responses. */
export class RequestReplyMessageProcessor {
  private readonly jetStream: { publish: (subject: string, data: Uint8Array) => Promise<unknown>; };
  private readonly logger: EventLoggerService;
  private readonly dlqSubjectBuilder: (subject: string) => string;
  private readonly dispatch: (options: DispatchOptions) => Promise<void>;
  constructor(deps: MessageProcessorDeps) {
    this.jetStream = deps.jetStream;
    this.logger = deps.logger;
    this.dlqSubjectBuilder = deps.dlqSubjectBuilder;
    this.dispatch = deps.dispatch;
  }
  /** Entry point: processes a single NATS JetStream message. */
  async processMessage(msg: JsMsg, subject: string): Promise<void> {
    let plain: Record<string, unknown> | undefined;
    try {
      plain = this.parseMessageData(msg);
      const envelope = this.validateEnvelope(plain, msg.subject);
      const context = envelopeToContext(envelope);
      const logCtx = this.toLogContext(subject, envelope);
      const dispatchOptions: DispatchOptions = { subject, event: envelope, context };
      await this.dispatch(dispatchOptions);
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

  private isInvalidEventPayload(parsed: unknown): boolean {
    return typeof parsed !== 'object' || parsed === null || Array.isArray(parsed);
  }

  private validateEnvelope(plain: Record<string, unknown>, subject: string): EventEnvelope<unknown> {
    const envelope = plainToInstance(EventEnvelope, plain);
    const errors = validateSync(envelope);
    if (errors.length > 0) {
      throw this.createValidationException({ errors, subject, plain });
    }
    return envelope;
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

  private async handleError(options: {
    error: unknown;
    msg: JsMsg;
    subject: string;
    originalPayload?: Record<string, unknown>;
  }): Promise<void> {
    if (options.error instanceof EventConsumerException && !this.isParseError(options.error)) {
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

  private isParseError(error: EventConsumerException): boolean {
    return error.eventId === 'unknown' && error.eventType === 'unknown';
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
      await this.jetStream.publish(dlqSubject, encodeEvent(dlqPayload));
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

  private exceptionToErrorContext(
    exception: EventConsumerException,
    subject: string,
  ): EventErrorLogContext {
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
