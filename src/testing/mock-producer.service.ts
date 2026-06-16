import { Injectable } from '@nestjs/common';
import { EventEnvelope } from '../common/envelope/event-envelope.class';
import { EmitOptions } from '../producer/producer.service';
import { generateEventId } from '../common/utils/uuid.utils';
import { nowIso } from '../common/utils/date.utils';
import { PublishedEvent } from './published-event.interface';

@Injectable()
export class MockProducerService {
  private readonly published: PublishedEvent[] = [];

  async publish(subject: string, event: EventEnvelope<unknown>): Promise<void> {
    this.recordPublish(subject, event);
  }

  async emit<T>(options: EmitOptions<T>): Promise<void> {
    const envelope = this.buildEnvelope(options);
    await this.publish(options.subject, envelope);
  }

  getPublishedEvents(): ReadonlyArray<PublishedEvent> {
    return this.published;
  }

  getLastEvent(): PublishedEvent | undefined {
    return this.published.at(-1);
  }

  getPublishedSubjects(): string[] {
    return this.published.map((entry) => entry.subject);
  }

  get count(): number {
    return this.published.length;
  }

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
