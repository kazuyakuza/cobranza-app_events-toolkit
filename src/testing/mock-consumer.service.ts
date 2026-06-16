import { Injectable } from '@nestjs/common';
import { EventEnvelope } from '../common/envelope/event-envelope.class';
import { EventHandler } from '../consumer/consumer.service';
import { DispatchOptions } from '../consumer/dispatch-options.interface';
import { envelopeToContext } from '../consumer/subscribe-options.interface';
import { EventConsumerException } from '../common/errors/event-consumer.exception';

@Injectable()
export class MockConsumerService {
  private readonly handlers = new Map<string, EventHandler>();

  registerHandler(subject: string, handler: EventHandler): void {
    this.handlers.set(subject, handler);
  }

  async dispatch(options: DispatchOptions): Promise<void> {
    const handler = this.getHandler(options.subject);
    if (!handler) {
      throw new EventConsumerException({
        message: `No handler registered for subject: ${options.subject}`,
        eventId: options.event.id,
        eventType: options.event.type,
        correlationId: options.event.correlation_id,
      });
    }
    await handler(options.event, options.context);
  }

  getHandler(subject: string): EventHandler | undefined {
    return this.handlers.get(subject);
  }

  get handlerCount(): number {
    return this.handlers.size;
  }

  async simulateEvent(subject: string, event: EventEnvelope<unknown>): Promise<void> {
    const context = envelopeToContext(event);
    await this.dispatch({ subject, event, context });
  }

  clear(): void {
    this.handlers.clear();
  }
}
