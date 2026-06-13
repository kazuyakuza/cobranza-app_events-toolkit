import { Injectable } from '@nestjs/common';
import { EventEnvelope } from '../common/envelope/event-envelope.class';
import { EventContext } from '../common/envelope/event-context.interface';
import { EventConsumerException } from '../common/errors/event-consumer.exception';
import { DispatchOptions } from './dispatch-options.interface';

/** Handler function invoked when a consumed event matches a registered subject. */
export type EventHandler = (event: EventEnvelope<unknown>, context: EventContext) => Promise<void>;

/**
 * Registry that maps NATS subjects to event handler functions.
 *
 * Consumer modules register handlers via {@link registerHandler},
 * and the {@link JetStreamConsumerService} dispatches incoming
 * messages by looking up the handler for the message subject.
 */
@Injectable()
export class ConsumerService {
  private readonly handlers = new Map<string, EventHandler>();

  /**
   * Registers a handler function for the given subject pattern.
   *
   * If a handler is already registered for the subject, it is replaced.
   */
  registerHandler(subject: string, handler: EventHandler): void {
    this.handlers.set(subject, handler);
  }

  /**
   * Dispatches a consumed event to the handler registered for the subject.
   *
   * Throws {@link EventConsumerException} if no handler is registered,
   * causing the message to be routed to the DLQ.
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

  /** Returns the handler for the given subject, or undefined if none is registered. */
  getHandler(subject: string): EventHandler | undefined {
    return this.handlers.get(subject);
  }

  /** Returns the number of registered handlers. */
  get handlerCount(): number {
    return this.handlers.size;
  }
}
