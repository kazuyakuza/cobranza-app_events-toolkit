import { Inject, Injectable } from '@nestjs/common';
import { JetStreamClient } from 'nats';
import { GlobalEventContext } from '../common/envelope/global-event-context.interface';
import { GlobalEventEnvelope } from '../common/envelope/global-event-envelope.class';
import { AnyEventEnvelope } from '../common/envelope/envelope-types';
import { generateEventId } from '../common/utils/uuid.utils';
import { nowIso } from '../common/utils/date.utils';
import { encodeEvent } from '../common/utils/serialization.utils';
import { EventLoggerService, EventLogContext, EventErrorLogContext } from '../logging/event-logger.service';
import { JETSTREAM_TOKEN } from './producer.constants';
import { EventContext } from '../common/envelope/event-context.interface';
import { EventEnvelope } from '../common/envelope/event-envelope.class';

/** Parameters for {@link ProducerService.emit}. */
export interface EmitOptions<T> {
  /** NATS subject to publish the event to. */
  subject: string;
  /** Domain-specific business payload. */
  data: T;
  /** Metadata context for the event envelope. */
  context: EventContext;
}

/** Parameters for {@link ProducerService.emitGlobal}. */
export interface EmitGlobalOptions<T> {
  /** NATS subject to publish the event to. */
  subject: string;
  /** Domain-specific business payload. */
  data: T;
  /** Metadata context for the global event envelope (no companyId). */
  context: GlobalEventContext;
}

/**
 * Publishes domain events to NATS JetStream with structured logging.
 *
 * Provides three publishing modes:
 * - `publish` — sends a pre-built {@link AnyEventEnvelope} directly.
 * - `emit` — builds a tenant envelope from an {@link EventContext} and payload, then publishes.
 * - `emitGlobal` — builds a global envelope from a {@link GlobalEventContext} and payload, then publishes.
 */
@Injectable()
export class ProducerService {
  constructor(
    @Inject(JETSTREAM_TOKEN) private readonly jetStream: JetStreamClient,
    private readonly logger: EventLoggerService,
  ) { }

  /**
   * Publishes a pre-built event envelope to the given NATS subject.
   *
   * Accepts both {@link EventEnvelope} and {@link GlobalEventEnvelope} variants.
   * Logs success or failure via {@link EventLoggerService}.
   *
   * @param subject - NATS subject to publish to.
   * @param event - Fully constructed event envelope (tenant or global).
   */
  async publish(subject: string, event: AnyEventEnvelope<unknown>): Promise<void> {
    const payload = encodeEvent(event);
    try {
      await this.jetStream.publish(subject, payload);
      this.logEmission(subject, event);
    } catch (error: unknown) {
      this.logger.logEventError(this.toErrorLogContext(subject, event, error));
      throw error;
    }
  }

  /**
   * Builds an {@link EventEnvelope} from structured options and publishes it.
   *
   * Higher-level convenience over {@link ProducerService.publish} — generates the
   * event ID and timestamp automatically from the provided {@link EventContext}.
   *
   * @typeParam T - Domain-specific payload type.
   * @param options - Subject, payload, and metadata context.
   */
  async emit<T>(options: EmitOptions<T>): Promise<void> {
    const envelope = this.buildEnvelope(options);
    await this.publish(options.subject, envelope);
  }

  /**
   * Builds a {@link GlobalEventEnvelope} from structured options and publishes it.
   *
   * Convenience method for tenant-less event emission. Generates the
   * event ID and timestamp automatically from the provided {@link GlobalEventContext}.
   *
   * @typeParam T - Domain-specific payload type.
   * @param options - Subject, payload, and global metadata context.
   */
  async emitGlobal<T>(options: EmitGlobalOptions<T>): Promise<void> {
    const envelope = this.buildGlobalEnvelope(options);
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

  private buildGlobalEnvelope<T>(options: EmitGlobalOptions<T>): GlobalEventEnvelope<T> {
    const { context, data } = options;
    return new GlobalEventEnvelope<T>({
      id: generateEventId(),
      produced_at: nowIso(),
      type: context.type,
      version: context.version,
      producer: context.producer,
      actor_type: context.actorType,
      actor_id: context.actorId,
      correlation_id: context.correlationId,
      causation_id: context.causationId,
      trace_id: context.traceId,
      reply_to: context.replyTo,
      data,
    });
  }

  private logEmission(subject: string, event: AnyEventEnvelope<unknown>): void {
    this.logger.logEventEmitted(this.toLogContext(subject, event));
  }

  private toLogContext(subject: string, event: AnyEventEnvelope<unknown>): EventLogContext {
    return {
      eventId: event.id,
      eventType: event.type,
      subject,
      correlationId: event.correlation_id,
      traceId: event.trace_id,
    };
  }

  private toErrorLogContext(subject: string, event: AnyEventEnvelope<unknown>, error: unknown): EventErrorLogContext {
    const err = error instanceof Error ? error : new Error(String(error));
    return {
      ...this.toLogContext(subject, event),
      error: err.message,
      stack: err.stack,
    };
  }
}
