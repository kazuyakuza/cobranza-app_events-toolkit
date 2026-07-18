import { JsMsg } from 'nats';
import { EventConsumerException } from '../common/errors/event-consumer.exception';
import { AnyEventEnvelope } from '../common/envelope/envelope-types';
import { encodeEvent } from '../common/utils/serialization.utils';
import { EventLoggerService, EventLogContext, EventErrorLogContext } from '../logging/event-logger.service';
import { DispatchOptions } from './dispatch-options.interface';
import { envelopeToContext, DlqRoutingOptions } from './subscribe-options.interface';
import { EnvelopeValidationUtil } from './envelope-validation.util';

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
      plain = EnvelopeValidationUtil.parseMessageData(msg);
      const envelope = EnvelopeValidationUtil.validateEnvelope(plain, msg.subject);
      const context = envelopeToContext(envelope, msg.subject);
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
