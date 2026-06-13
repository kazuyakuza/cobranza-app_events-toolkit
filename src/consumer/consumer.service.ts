import { Injectable } from '@nestjs/common';
import { EventEnvelope } from '../common/envelope/event-envelope.class';
import { EventContext } from '../producer/producer.service';

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
   *
   * @param subject - NATS subject pattern to match (e.g. `company.*.payment.proof.uploaded.v1`).
   * @param handler - Async function invoked when an event on the subject is consumed.
   */
  registerHandler(subject: string, handler: EventHandler): void {
    this.handlers.set(subject, handler);
  }

  /**
   * Dispatches a consumed event to the handler registered for the subject.
   *
   * Throws an error if no handler is registered for the subject.
   *
   * @param subject - Exact NATS subject of the incoming message.
   * @param event - Deserialized and validated event envelope.
   * @param context - Metadata context extracted from the event envelope.
   */
  async dispatch(subject: string, event: EventEnvelope<unknown>, context: EventContext): Promise<void> {
    const handler = this.getHandler(subject);
    if (!handler) {
      throw new Error(`No handler registered for subject: ${subject}`);
    }
    await handler(event, context);
  }

  /**
   * Returns the handler for the given subject, or undefined if none is registered.
   */
  getHandler(subject: string): EventHandler | undefined {
    return this.handlers.get(subject);
  }

  /**
   * Returns the number of registered handlers.
   */
  get handlerCount(): number {
    return this.handlers.size;
  }
}
