import { Injectable } from '@nestjs/common';
import { EventEnvelope } from '../common/envelope/event-envelope.class';
import { EmitOptions } from '../producer/producer.service';
import { generateEventId } from '../common/utils/uuid.utils';
import { nowIso } from '../common/utils/date.utils';
import { PublishedEvent } from './published-event.interface';

/**
 * In-memory mock for `ProducerService`.
 *
 * Records all published events with timestamps for test assertions.
 */
@Injectable()
export class MockProducerService {
  private readonly published: PublishedEvent[] = [];

  /** Records a published event with the given subject. */
  async publish(subject: string, event: EventEnvelope<unknown>): Promise<void> {
    this.recordPublish(subject, event);
  }

  /** Builds an envelope from `EmitOptions` and records it. */
  async emit<T>(options: EmitOptions<T>): Promise<void> {
    const envelope = this.buildEnvelope(options);
    await this.publish(options.subject, envelope);
  }

  /** Returns all recorded published events. */
  getPublishedEvents(): ReadonlyArray<PublishedEvent> {
    return this.published;
  }

  /** Returns the most recently published event, or `undefined` if none. */
  getLastEvent(): PublishedEvent | undefined {
    return this.published.at(-1);
  }

  /** Returns all published events matching the given NATS subject. */
  getPublishedEventsBySubject(subject: string): ReadonlyArray<PublishedEvent> {
    return this.published.filter((entry) => entry.subject === subject);
  }

  /** Returns all published subject strings in insertion order. */
  getPublishedSubjects(): string[] {
    return this.published.map((entry) => entry.subject);
  }

  /** Number of recorded published events. */
  get count(): number {
    return this.published.length;
  }

  /** Resets all recorded published events. */
  clear(): void {
    this.published.length = 0;
  }

  private recordPublish(subject: string, event: EventEnvelope<unknown>): void {
    this.published.push({ subject, event, timestamp: nowIso() });
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
}
