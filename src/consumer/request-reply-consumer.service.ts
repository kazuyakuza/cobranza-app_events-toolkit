import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { JetStreamClient, JsMsg } from 'nats';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { EventEnvelope } from '../common/envelope/event-envelope.class';
import { EventConsumerException } from '../common/errors/event-consumer.exception';
import { encodeEvent } from '../common/utils/serialization.utils';
import { EventLoggerService, EventLogContext, EventErrorLogContext } from '../logging/event-logger.service';
import { EventHandler } from './consumer.service';
import { DispatchOptions } from './dispatch-options.interface';
import { RegisterHandlerOptions } from './register-handler-options.interface';
import {
  RequestReplyConsumerDeps,
  REQUEST_REPLY_CONSUMER_DEPS_TOKEN,
} from './request-reply-consumer-deps.interface';
import {
  defaultDlqSubjectBuilder,
  envelopeToContext,
  ValidationErrorOptions,
  ErrorHandlingOptions,
  DlqRoutingOptions,
} from './subscribe-options.interface';

/**
 * Registry and dispatch service for async request-reply response handlers.
 *
 * Subscribes to a configurable NATS subject pattern (default: `company.*.response.v1`)
 * on module init, parses incoming response messages, and dispatches to handlers
 * registered via the @OnRequestReply() decorator (or directly).
 *
 * Handler lookup follows a precedence rule:
 * 1. Specific handler for `eventType:companyId` (tenant-scoped).
 * 2. Generic handler for `eventType` (all tenants).
 */
@Injectable()
export class RequestReplyConsumerService implements OnModuleInit {
  private readonly handlers = new Map<string, EventHandler>();
  private readonly jetStream: JetStreamClient;
  private readonly logger: EventLoggerService;
  private readonly responseSubjectPattern: string;
  private readonly dlqSubjectBuilder: (subject: string) => string;

  constructor(@Inject(REQUEST_REPLY_CONSUMER_DEPS_TOKEN) deps: RequestReplyConsumerDeps) {
    this.jetStream = deps.jetStream;
    this.logger = deps.logger;
    this.responseSubjectPattern = deps.responseSubjectPattern ?? 'company.*.response.v1';
    this.dlqSubjectBuilder = deps.dlqSubjectBuilder ?? defaultDlqSubjectBuilder;
  }

  /** Auto-subscribes to the response subject pattern on module init. */
  onModuleInit(): void {
    this.subscribe(this.responseSubjectPattern).catch((error: unknown) =>
      this.logGeneralError(error, this.responseSubjectPattern),
    );
  }

  /**
   * Registers a handler for the given event type.
   * If `options.companyId` is provided, the handler is scoped to that tenant.
   * Replaces any existing handler for the same key.
   */
  registerHandler(options: RegisterHandlerOptions): void {
    const key = this.buildHandlerKey(options.eventType, options.companyId);
    this.handlers.set(key, options.handler);
  }

  /**
   * Dispatches an event to the matching handler.
   *
   * Looks up a handler by `eventType:companyId` first (specific),
   * then falls back to `eventType` alone (generic).
   *
   * Throws EventConsumerException when no handler matches.
   */
  async dispatch(options: DispatchOptions): Promise<void> {
    const handler = this.findHandler(options.event.type, options.event.company_id);
    if (!handler) {
      throw new EventConsumerException({
        message: `No request-reply handler registered for event type: ${options.event.type}`,
        eventId: options.event.id,
        eventType: options.event.type,
        correlationId: options.event.correlation_id,
      });
    }
    await handler(options.event, options.context);
  }

  /** Returns the handler for the given key, checking company-scoped first. */
  getHandler(eventType: string, companyId?: string): EventHandler | undefined {
    return this.findHandler(eventType, companyId);
  }

  /** Returns the number of registered handlers. */
  get handlerCount(): number {
    return this.handlers.size;
  }

  /**
   * Subscribes to the given NATS subject pattern for response messages.
   * Can be called externally to override the default response subject.
   */
  async subscribe(subject: string): Promise<void> {
    const subscription = await this.jetStream.subscribe(subject, {});
    this.processSubscription(subscription, subject).catch((error: unknown) =>
      this.logGeneralError(error, subject),
    );
  }

  private findHandler(eventType: string, companyId?: string): EventHandler | undefined {
    const specificKey = this.buildHandlerKey(eventType, companyId);
    return this.handlers.get(specificKey) ?? this.handlers.get(eventType);
  }

  private buildHandlerKey(eventType: string, companyId?: string): string {
    return companyId ? `${eventType}:${companyId}` : eventType;
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
