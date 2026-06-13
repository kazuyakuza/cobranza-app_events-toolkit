import { Inject, Injectable, Optional } from '@nestjs/common';
import { JetStreamClient, JsMsg, ConsumerOptsBuilder, ConsumerOpts } from 'nats';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { EventEnvelope } from '../common/envelope/event-envelope.class';
import { EventConsumerException } from '../common/errors/event-consumer.exception';
import { EventLoggerService, EventLogContext, EventErrorLogContext } from '../logging/event-logger.service';
import { ConsumerService, EventHandler } from './consumer.service';
import { NATS_JETSTREAM_TOKEN, DLQ_SUBJECT_BUILDER_TOKEN } from './consumer.module';

/** Consumer subscription options accepted by {@link SubscribeOptions}. */
export type ConsumerSubscribeOpts = ConsumerOptsBuilder | Partial<ConsumerOpts>;

/** Builds a DLQ subject by prepending `dlq.` to the original subject. */
export function defaultDlqSubjectBuilder(subject: string): string {
  return `dlq.${subject}`;
}

/** Extracts {@link EventContext} fields from a validated {@link EventEnvelope}. */
function envelopeToContext(envelope: EventEnvelope<unknown>): import('../producer/producer.service').EventContext {
  return {
    type: envelope.type,
    version: envelope.version,
    producer: envelope.producer,
    companyId: envelope.company_id,
    actorType: envelope.actor_type,
    actorId: envelope.actor_id,
    correlationId: envelope.correlation_id,
    causationId: envelope.causation_id,
    traceId: envelope.trace_id,
    replyTo: envelope.reply_to,
  };
}

/** Options for subscribing a handler to a NATS JetStream subject. */
export interface SubscribeOptions {
  /** NATS subject pattern to consume (e.g. `company.*.payment.proof.uploaded.v1`). */
  subject: string;
  /** Handler function invoked for each successfully validated event. */
  handler: EventHandler;
  /** NATS JetStream consumer options (e.g. durable name, deliver group, manual ack). */
  consumerOpts?: ConsumerSubscribeOpts;
}

/**
 * Manages JetStream message consumption, validation, and dispatch.
 *
 * For each subscribed subject:
 * 1. Parses the incoming `JsMsg.data` as JSON.
 * 2. Transforms the plain object into an {@link EventEnvelope} via `class-transformer`.
 * 3. Validates the envelope via `class-validator`.
 * 4. Dispatches validated events to the handler registered in {@link ConsumerService}.
 * 5. Routes invalid or failed messages to a Dead Letter Queue (DLQ).
 */
@Injectable()
export class JetStreamConsumerService {
  private readonly encoder = new TextEncoder();
  private readonly dlqSubjectBuilder: (subject: string) => string;

  constructor(
    @Inject(NATS_JETSTREAM_TOKEN) private readonly jetStream: JetStreamClient,
    private readonly consumerService: ConsumerService,
    private readonly logger: EventLoggerService,
    @Optional() @Inject(DLQ_SUBJECT_BUILDER_TOKEN) dlqSubjectBuilder?: (subject: string) => string,
  ) {
    this.dlqSubjectBuilder = dlqSubjectBuilder ?? defaultDlqSubjectBuilder;
  }

  /**
   * Registers a handler for the given subject and subscribes to JetStream.
   *
   * The handler is registered in {@link ConsumerService} and messages arriving
   * on the subject are processed through the full validation and dispatch pipeline.
   */
  async subscribe(options: SubscribeOptions): Promise<void> {
    this.consumerService.registerHandler(options.subject, options.handler);
    const subscription = await this.jetStream.subscribe(options.subject, options.consumerOpts ?? {});
    this.processSubscription(subscription, options.subject);
  }

  /** Processes an async iterable of JsMsg for a given subject. */
  private async processSubscription(subscription: AsyncIterable<JsMsg>, subject: string): Promise<void> {
    for await (const msg of subscription) {
      await this.handleMessage(msg, subject);
    }
  }

  /** Handles a single JetStream message: parse, validate, dispatch, ack/nack/DLQ. */
  private async handleMessage(msg: JsMsg, subject: string): Promise<void> {
    try {
      const envelope = await this.parseAndValidate(msg);
      const context = envelopeToContext(envelope);
      const logCtx = this.toLogContext(subject, envelope);
      await this.consumerService.dispatch(subject, envelope, context);
      msg.ack();
      this.logger.logEventConsumed(logCtx);
    } catch (error: unknown) {
      await this.handleError(error, msg, subject);
    }
  }

  /** Parses message data and validates the envelope. Throws on validation failure. */
  private async parseAndValidate(msg: JsMsg): Promise<EventEnvelope<unknown>> {
    const plain = this.parseMessageData(msg);
    const envelope = plainToInstance(EventEnvelope, plain);
    const errors = await validate(envelope);
    if (errors.length > 0) {
      throw this.createValidationException(errors, msg.subject, plain);
    }
    return envelope;
  }

  /** Decodes the raw message bytes to a plain JSON object. */
  private parseMessageData(msg: JsMsg): Record<string, unknown> {
    const text = new TextDecoder().decode(msg.data);
    const parsed: unknown = JSON.parse(text);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new Error('Message payload is not a valid JSON object');
    }
    return parsed as Record<string, unknown>;
  }

  /** Creates an EventConsumerException from class-validator errors. */
  private createValidationException(
    errors: import('class-validator').ValidationError[],
    subject: string,
    plain: Record<string, unknown>,
  ): EventConsumerException {
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

  /** Routes errors to the appropriate ack/nack/DLQ action. */
  private async handleError(error: unknown, msg: JsMsg, subject: string): Promise<void> {
    if (error instanceof EventConsumerException) {
      await this.routeToDlq(error, msg, subject);
      return;
    }
    msg.nak();
    this.logGeneralError(error, subject);
  }

  /** Publishes the failed message to DLQ and acks the original message. */
  private async routeToDlq(exception: EventConsumerException, msg: JsMsg, subject: string): Promise<void> {
    const dlqSubject = this.dlqSubjectBuilder(subject);
    const errorCtx = this.exceptionToErrorContext(exception, subject);
    this.logger.logEventDlq(errorCtx);
    try {
      await this.jetStream.publish(dlqSubject, this.encoder.encode(JSON.stringify(exception)));
      msg.ack();
    } catch {
      msg.nak();
    }
  }

  /** Logs a non-EventConsumerException processing error. */
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

  /** Converts an EventConsumerException to an EventErrorLogContext. */
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

  /** Extracts standard log context from a validated envelope and subject. */
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
