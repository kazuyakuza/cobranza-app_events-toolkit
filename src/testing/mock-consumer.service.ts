import { Injectable } from '@nestjs/common';
import { EventEnvelope } from '../common/envelope/event-envelope.class';
import { EventHandler } from '../consumer/consumer.service';
import { DispatchOptions } from '../consumer/dispatch-options.interface';
import { envelopeToContext } from '../consumer/subscribe-options.interface';
import { EventConsumerException } from '../common/errors/event-consumer.exception';

/**
 * In-memory mock for `ConsumerService`.
 *
 * Stores registered event handlers and provides `simulateEvent` to dispatch
 * test events without a NATS connection.
 */
@Injectable()
export class MockConsumerService {
  private readonly handlers = new Map<string, EventHandler>();

  /** Registers an event handler for the given NATS subject. */
  registerHandler(subject: string, handler: EventHandler): void {
    this.handlers.set(subject, handler);
  }

  /**
   * Dispatches an event to the handler registered for the given subject.
   * @throws {EventConsumerException} When no handler is registered for the subject.
   */
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

  /** Returns the handler registered for `subject`, or `undefined` if none. */
  getHandler(subject: string): EventHandler | undefined {
    return this.handlers.get(subject);
  }

  /** Number of currently registered handlers. */
  get handlerCount(): number {
    return this.handlers.size;
  }

  /**
   * Builds an `EventContext` from the envelope and dispatches it to the registered handler.
   * Convenience method for simulating incoming events in tests.
   */
  async simulateEvent(subject: string, event: EventEnvelope<unknown>): Promise<void> {
    const context = envelopeToContext(event);
    await this.dispatch({ subject, event, context });
  }

  /** Removes all registered handlers. */
  clear(): void {
    this.handlers.clear();
  }
}
