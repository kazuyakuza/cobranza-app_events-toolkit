import { Inject, Injectable } from '@nestjs/common';
import { JetStreamClient } from 'nats';
import { EventContext } from '../common/envelope/event-context.interface';
import { EventEnvelope } from '../common/envelope/event-envelope.class';
import { generateEventId } from '../common/utils/uuid.utils';
import { nowIso } from '../common/utils/date.utils';
import { encodeEvent } from '../common/utils/serialization.utils';
import { EventLoggerService, EventLogContext, EventErrorLogContext } from '../logging/event-logger.service';
import { JETSTREAM_TOKEN } from './producer.module';

/** Parameters for {@link ProducerService.emit}. */
export interface EmitOptions<T> {
  /** NATS subject to publish the event to. */
  subject: string;
  /** Domain-specific business payload. */
  data: T;
  /** Metadata context for the event envelope. */
  context: EventContext;
}

/**
 * Publishes domain events to NATS JetStream with structured logging.
 *
 * Provides two publishing modes:
 * - `publish` — sends a pre-built {@link EventEnvelope} directly.
 * - `emit` — builds an envelope from an {@link EventContext} and payload, then publishes.
 */
@Injectable()
export class ProducerService {
  constructor(
    @Inject(JETSTREAM_TOKEN) private readonly jetStream: JetStreamClient,
    private readonly logger: EventLoggerService,
  ) {}

  /**
   * Publishes a pre-built event envelope to the given NATS subject.
   *
   * Logs success or failure via {@link EventLoggerService}.
   *
   * @param subject - NATS subject to publish to.
   * @param event - Fully constructed event envelope.
   */
  async publish(subject: string, event: EventEnvelope<unknown>): Promise<void> {
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
