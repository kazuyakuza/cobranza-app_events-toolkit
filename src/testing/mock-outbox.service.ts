import { Injectable } from '@nestjs/common';
import { AnyEventEnvelope } from '../common/envelope/envelope-types';
import { isGlobalContext } from '../common/envelope/envelope-types';
import { createEvent, createGlobalEvent } from '../common/utils/event.factory';
import { SaveInTransactionParams } from '../outbox/save-in-transaction-params.interface';
import { SendAsyncRequestThroughOutboxOptions } from '../outbox/send-async-request-through-outbox-options.interface';
import { SendAsyncRequestThroughOutboxResult } from '../outbox/send-async-request-through-outbox-result.interface';
import { SavedOutboxEvent } from './saved-outbox-event.interface';

/**
 * In-memory mock for `OutboxService`.
 *
 * Records events saved to the outbox. Processor methods are no-ops.
 * Transaction context is accepted but ignored (mirrors SQLite behavior).
 */
@Injectable()
export class MockOutboxService {
  private readonly saved: SavedOutboxEvent[] = [];

  /** Records an event as saved to the outbox. */
  async saveToOutbox(event: AnyEventEnvelope<unknown>, subject: string): Promise<void> {
    this.saved.push({ event, subject });
  }

  /** Records an event within a transaction context (context is ignored; event is recorded). */
  async saveInTransaction(params: SaveInTransactionParams): Promise<void> {
    this.saved.push({ event: params.event, subject: params.subject });
  }

  /** Records a request-reply event through the outbox (same storage as `saveToOutbox`). */
  async sendRequestThroughOutbox(event: AnyEventEnvelope<unknown>, subject: string): Promise<void> {
    this.saved.push({ event, subject });
  }

  /** Builds an envelope from payload and context, records it, and returns the correlationId. */
  async sendAsyncRequestThroughOutbox<T>(
    options: SendAsyncRequestThroughOutboxOptions<T>,
  ): Promise<SendAsyncRequestThroughOutboxResult> {
    const envelope = isGlobalContext(options.context)
      ? createGlobalEvent(options.payload, options.context)
      : createEvent(options.payload, options.context);
    this.saved.push({ event: envelope, subject: options.subject });
    return { correlationId: envelope.correlation_id };
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
