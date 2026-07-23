import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { JetStreamClient, JsMsg } from 'nats';
import { EventConsumerException } from '../common/errors/event-consumer.exception';
import { EventLoggerService } from '../logging/event-logger.service';
import { EventHandler } from './consumer.service';
import { DispatchOptions } from './dispatch-options.interface';
import { RegisterHandlerOptions } from './register-handler-options.interface';
import { RequestReplyConsumerDeps, REQUEST_REPLY_CONSUMER_DEPS_TOKEN } from './request-reply-consumer-deps.interface';
import { ConsumerSubscribeOpts, defaultDlqSubjectBuilder } from './subscribe-options.interface';
import { resolveSubscriptionConsumerOpts } from './consumer-opts-merger';
import { GatewayConsumerOptions } from './gateway-consumer-options.interface';
import { RequestReplyMessageProcessor } from './request-reply-message-processor';
import { StreamAutoCreator } from './stream-auto-creator';
import { createStreamAutoCreator, ensureStreamExists } from './consumer-stream.utils';

/**
 * Registry and dispatch service for async request-reply response handlers.
 *
 * Subscribes to a configurable NATS subject pattern on module init, parses
 * incoming response messages, and dispatches to registered handlers.
 * Message processing (parsing, validation, DLQ routing) is delegated to
 * {@link RequestReplyMessageProcessor}.
 */
@Injectable()
export class RequestReplyConsumerService implements OnModuleInit {
  private readonly handlers = new Map<string, EventHandler>();
  private readonly jetStream: JetStreamClient;
  private readonly logger: EventLoggerService;
  private readonly responseSubjectPattern: string;
  private readonly processor: RequestReplyMessageProcessor;
  private readonly streamAutoCreator?: StreamAutoCreator;
  private readonly gatewayConsumerOpts?: GatewayConsumerOptions;

  constructor(@Inject(REQUEST_REPLY_CONSUMER_DEPS_TOKEN) deps: RequestReplyConsumerDeps) {
    this.jetStream = deps.jetStream;
    this.logger = deps.logger;
    this.responseSubjectPattern = deps.responseSubjectPattern ?? 'company.*.response.v1';
    this.gatewayConsumerOpts = deps.gatewayConsumerOpts;
    const dlqSubjectBuilder = deps.dlqSubjectBuilder ?? defaultDlqSubjectBuilder;
    this.processor = new RequestReplyMessageProcessor({
      jetStream: this.jetStream,
      logger: this.logger,
      dlqSubjectBuilder,
      dispatch: (options: DispatchOptions) => this.dispatch(options),
    });
    this.streamAutoCreator = createStreamAutoCreator(deps);
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
   */
  registerHandler(options: RegisterHandlerOptions): void {
    const key = this.buildHandlerKey(options.eventType, options.companyId);
    this.handlers.set(key, options.handler);
  }

  /**
   * Dispatches an event to the matching handler.
   * Looks up by `eventType:companyId` first, then falls back to `eventType`.
   */
  async dispatch(options: DispatchOptions): Promise<void> {
    const tenantId = 'company_id' in options.event ? options.event.company_id : undefined;
    const handler = this.findHandler(options.event.type, tenantId);
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

  /** Returns the handler for the given key. */
  getHandler(eventType: string, companyId?: string): EventHandler | undefined {
    return this.findHandler(eventType, companyId);
  }

  /** Returns the number of registered handlers. */
  get handlerCount(): number {
    return this.handlers.size;
  }

  /** Subscribes to a NATS subject pattern for response messages. */
  async subscribe(subject: string, consumerOpts?: ConsumerSubscribeOpts): Promise<void> {
    await ensureStreamExists(this.streamAutoCreator, subject);
    const resolvedOpts = resolveSubscriptionConsumerOpts(this.gatewayConsumerOpts, consumerOpts);
    const subscription = await this.jetStream.subscribe(subject, resolvedOpts);
    this.processSubscription(subscription, subject).catch((error: unknown) => this.logGeneralError(error, subject));
  }

  private findHandler(eventType: string, companyId?: string): EventHandler | undefined {
    const specificKey = this.buildHandlerKey(eventType, companyId);
    return this.handlers.get(specificKey) ?? this.handlers.get(eventType);
  }

  private buildHandlerKey(eventType: string, companyId?: string): string {
    return companyId ? `${eventType}:${companyId}` : eventType;
  }

  private logGeneralError(error: unknown, subject: string): void {
    this.logger.logEventError({
      eventId: 'unknown',
      eventType: 'unknown',
      subject,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
  }

  private async processSubscription(subscription: AsyncIterable<JsMsg>, subject: string): Promise<void> {
    for await (const msg of subscription) {
      await this.processor.processMessage(msg, subject);
    }
  }
}
