import { JetStreamClient, JsMsg } from 'nats';
import { EventConsumerException } from '../common/errors/event-consumer.exception';
import { encodeEvent } from '../common/utils/serialization.utils';
import { EventLoggerService, EventErrorLogContext } from '../logging/event-logger.service';
import { DlqRoutingOptions } from './subscribe-options.interface';
import { MoveToDlqOptions } from './move-to-dlq-options.interface';

/** Dependencies required by {@link ConsumerDlqHandler}. */
interface ConsumerDlqHandlerDeps {
  jetStream: JetStreamClient;
  logger: EventLoggerService;
  dlqSubjectBuilder: (subject: string) => string;
}

/** Options for publishing a DLQ payload and deciding the fate of the source message. */
interface PublishDlqOptions {
  dlqSubject: string;
  dlqPayload: Record<string, unknown>;
  msg: JsMsg;
  originalSubject: string;
}

/** Options for building a DLQ payload from an {@link EventConsumerException}. */
interface BuildExceptionDlqPayloadOptions {
  subject: string;
  exception: EventConsumerException;
  originalPayload?: Record<string, unknown>;
}

/** Handles Dead Letter Queue routing and payload construction for a JetStream consumer. */
export class ConsumerDlqHandler {
  private readonly jetStream: JetStreamClient;
  private readonly logger: EventLoggerService;
  private readonly dlqSubjectBuilder: (subject: string) => string;

  constructor(deps: ConsumerDlqHandlerDeps) {
    this.jetStream = deps.jetStream;
    this.logger = deps.logger;
    this.dlqSubjectBuilder = deps.dlqSubjectBuilder;
  }

  /** Routes a message to the DLQ because an {@link EventConsumerException} was thrown. */
  async routeToDlq(options: DlqRoutingOptions): Promise<void> {
    const { exception, msg, subject, originalPayload } = options;
    const dlqSubject = this.dlqSubjectBuilder(subject);
    const errorCtx = this.exceptionToErrorContext(exception, subject);
    this.logger.logEventDlq(errorCtx);
    const dlqPayload = this.buildExceptionDlqPayload({ subject, exception, originalPayload });
    await this.publishDlqOrNak({ dlqSubject, dlqPayload, msg, originalSubject: subject });
  }

  /** Manually routes a JetStream message to the DLQ. */
  async moveToDlq(options: MoveToDlqOptions): Promise<void> {
    const subject = options.subject ?? options.message.subject;
    const dlqSubject = this.dlqSubjectBuilder(subject);
    const dlqPayload = this.buildManualDlqPayload(subject, options);
    await this.publishDlqOrNak({ dlqSubject, dlqPayload, msg: options.message, originalSubject: subject });
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
  private async publishDlqOrNak(options: PublishDlqOptions): Promise<void> {
    const { dlqSubject, dlqPayload, msg, originalSubject } = options;
    try {
      await this.jetStream.publish(dlqSubject, encodeEvent(dlqPayload));
      msg.ack();
    } catch (publishError: unknown) {
      this.logGeneralError(publishError, originalSubject);
      msg.nak();
    }
  }

  /** Builds a DLQ payload from an {@link EventConsumerException}, including optional metadata. */
  private buildExceptionDlqPayload(options: BuildExceptionDlqPayloadOptions): Record<string, unknown> {
    const { subject, exception, originalPayload } = options;
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
}
