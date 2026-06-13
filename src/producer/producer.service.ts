import { Inject, Injectable } from '@nestjs/common';
import { JetStreamClient } from 'nats';
import { ActorType } from '../common/envelope/actor-type.enum';
import { EventEnvelope } from '../common/envelope/event-envelope.class';
import { generateEventId } from '../common/utils/uuid.utils';
import { nowIso } from '../common/utils/date.utils';
import { EventLoggerService, EventLogContext, EventErrorLogContext } from '../logging/event-logger.service';
import { JETSTREAM_TOKEN } from './producer.module';

/** Context metadata for building and tracing an event envelope. */
export interface EventContext {
  /** Event type in dot-notation (e.g. `payment.proof.uploaded`). */
  type: string;
  /** Schema version of the event envelope and payload. */
  version: string;
  /** Name of the microservice that produced this event. */
  producer: string;
  /** Company UUID for tenant isolation. */
  companyId: string;
  /** Type of actor who performed the action. */
  actorType: ActorType;
  /** Unique identifier of the actor. */
  actorId: string;
  /** Shared ID for correlation across a request chain. */
  correlationId: string;
  /** ID of the event that directly triggered this event. */
  causationId?: string;
  /** OpenTelemetry trace ID for cross-service observability. */
  traceId?: string;
  /** NATS subject for async request-reply response routing. */
  replyTo?: string;
}

/** Parameters for {@link ProducerService.emit}. */
export interface EmitOptions<T> {
  /** NATS subject to publish the event to. */
  subject: string;
  /** Domain-specific business payload. */
  data: T;
  /** Metadata context for the event envelope. */
  context: EventContext;
}

@Injectable()
export class ProducerService {
  private readonly encoder = new TextEncoder();

  constructor(
    @Inject(JETSTREAM_TOKEN) private readonly jetStream: JetStreamClient,
    private readonly logger: EventLoggerService,
  ) {}

  async publish(subject: string, event: EventEnvelope<unknown>): Promise<void> {
    const payload = this.encodeEvent(event);
    try {
      await this.jetStream.publish(subject, payload);
      this.logEmission(subject, event);
    } catch (error: unknown) {
      this.logger.logEventError(this.toErrorLogContext(subject, event, error));
      throw error;
    }
  }

  async emit<T>(options: EmitOptions<T>): Promise<void> {
    const envelope = this.buildEnvelope(options);
    await this.publish(options.subject, envelope);
  }

  private buildEnvelope<T>(options: EmitOptions<T>): EventEnvelope<T> {
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

  private encodeEvent(event: EventEnvelope<unknown>): Uint8Array {
    return this.encoder.encode(JSON.stringify(event));
  }

  private logEmission(subject: string, event: EventEnvelope<unknown>): void {
    this.logger.logEventEmitted(this.toLogContext(subject, event));
  }

  private toLogContext(subject: string, event: EventEnvelope<unknown>): EventLogContext {
    return {
      eventId: event.id,
      eventType: event.type,
      subject,
      correlationId: event.correlation_id,
      traceId: event.trace_id,
    };
  }

  private toErrorLogContext(subject: string, event: EventEnvelope<unknown>, error: unknown): EventErrorLogContext {
    const err = error instanceof Error ? error : new Error(String(error));
    return {
      ...this.toLogContext(subject, event),
      error: err.message,
      stack: err.stack,
    };
  }
}
