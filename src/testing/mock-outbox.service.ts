import { Injectable } from '@nestjs/common';
import { EventEnvelope } from '../common/envelope/event-envelope.class';
import { SavedOutboxEvent } from './saved-outbox-event.interface';

@Injectable()
export class MockOutboxService {
  private readonly saved: SavedOutboxEvent[] = [];

  async saveToOutbox(event: EventEnvelope<unknown>, subject: string): Promise<void> {
    this.saved.push({ event, subject });
  }

  async sendRequestThroughOutbox(event: EventEnvelope<unknown>, subject: string): Promise<void> {
    this.saved.push({ event, subject });
  }

  startProcessor(): void {
    // no-op for testing
  }

  stopProcessor(): void {
    // no-op for testing
  }

  getSavedEvents(): ReadonlyArray<SavedOutboxEvent> {
    return this.saved;
  }

  get count(): number {
    return this.saved.length;
  }

  clear(): void {
    this.saved.length = 0;
  }
}
