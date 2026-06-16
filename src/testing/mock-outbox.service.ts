import { Injectable } from '@nestjs/common';
import { EventEnvelope } from '../common/envelope/event-envelope.class';
import { SavedOutboxEvent } from './saved-outbox-event.interface';

/**
 * In-memory mock for `OutboxService`.
 *
 * Records events saved to the outbox. Processor methods are no-ops.
 */
@Injectable()
export class MockOutboxService {
  private readonly saved: SavedOutboxEvent[] = [];

  /** Records an event as saved to the outbox. */
  async saveToOutbox(event: EventEnvelope<unknown>, subject: string): Promise<void> {
    this.saved.push({ event, subject });
  }

  /** Records a request-reply event through the outbox (same storage as `saveToOutbox`). */
  async sendRequestThroughOutbox(event: EventEnvelope<unknown>, subject: string): Promise<void> {
    this.saved.push({ event, subject });
  }

  /** No-op — processor does not run in tests. */
  startProcessor(): void {
    // no-op for testing
  }

  /** No-op — processor does not run in tests. */
  stopProcessor(): void {
    // no-op for testing
  }

  /** Returns all recorded outbox events. */
  getSavedEvents(): ReadonlyArray<SavedOutboxEvent> {
    return this.saved;
  }

  /** Number of recorded outbox events. */
  get count(): number {
    return this.saved.length;
  }

  /** Resets all recorded outbox events. */
  clear(): void {
    this.saved.length = 0;
  }
}
