import { Injectable, Inject, OnModuleDestroy } from '@nestjs/common';
import { EventEnvelope } from '../common/envelope/event-envelope.class';
import { OutboxEntry } from './outbox.types';
import { OutboxServiceDeps, OUTBOX_SERVICE_DEPS_TOKEN } from './outbox-service-deps.interface';
import { SaveInTransactionParams } from './save-in-transaction-params.interface';
import { OutboxServiceOptions } from './outbox-service-options.interface';
import {
  buildDlqSubject,
  parseEnvelope,
  extractErrorMessage,
  calculateBackoff,
  delay,
  buildDlqPayload,
  createDlqEnvelope,
} from './outbox.utils';
import { ensureReplyToPresent } from './outbox-request-reply.helpers';
import {
  logOutboxSaved,
  toOutboxLogContext,
  toOutboxErrorLogContext,
  logProcessorError,
} from './outbox-logging.helpers';

const DEFAULTS: Required<OutboxServiceOptions> = {
  enabled: true,
  processorIntervalMs: 5000,
  maxRetries: 3,
  retryBackoffBaseMs: 1000,
  dlqSubjectBuilder: buildDlqSubject,
};
const PENDING_BATCH_SIZE = 100;
/**
 * Manages the transactional outbox pattern for reliable event publishing.
 *
 * Provides saveToOutbox for persisting events before publishing,
 * and a background processor that reads pending entries, publishes them
 * via ProducerService, and handles retries with DLQ routing on final failure.
 *
 * Implements OnModuleDestroy for graceful processor shutdown.
 */
@Injectable()
export class OutboxService implements OnModuleDestroy {
  private readonly repository: OutboxServiceDeps['repository'];
  private readonly producerService: OutboxServiceDeps['producerService'];
  private readonly logger: OutboxServiceDeps['logger'];
  private readonly options: Required<OutboxServiceOptions>;

  private processorIntervalId: ReturnType<typeof setInterval> | null = null;
  private isProcessing = false;

  constructor(@Inject(OUTBOX_SERVICE_DEPS_TOKEN) deps: OutboxServiceDeps) {
    this.repository = deps.repository;
    this.producerService = deps.producerService;
    this.logger = deps.logger;
    this.options = { ...DEFAULTS, ...deps.options };
  }

  /** Persists an event envelope to the outbox for asynchronous delivery. */
  async saveToOutbox(event: EventEnvelope<unknown>, subject: string): Promise<void> {
    await this.repository.save({ event, subject });
    logOutboxSaved({ event, subject, logger: this.logger });
  }

  /** Persists an event to the outbox within an active database transaction. */
  async saveInTransaction(params: SaveInTransactionParams): Promise<void> {
    await this.repository.save({
      event: params.event,
      subject: params.subject,
      transactionContext: params.transactionContext,
    });
    logOutboxSaved({ event: params.event, subject: params.subject, logger: this.logger });
  }

  /** Persists a request-reply event to the outbox after validating `reply_to` is present. */
  async sendRequestThroughOutbox(event: EventEnvelope<unknown>, subject: string): Promise<void> {
    ensureReplyToPresent(event);
    await this.saveToOutbox(event, subject);
  }

  /** Starts the background processor that polls for pending outbox events. */
  startProcessor(): void {
    if (!this.shouldStartProcessor()) {
      return;
    }
    this.processorIntervalId = setInterval(() => {
      this.processPendingEvents().catch((error: unknown) => logProcessorError({ error, logger: this.logger }));
    }, this.options.processorIntervalMs);
  }

  /** Stops the background processor gracefully. */
  stopProcessor(): void {
    if (!this.hasProcessorStarted()) {
      return;
    }
    clearInterval(this.processorIntervalId!);
    this.processorIntervalId = null;
  }

  /** NestJS lifecycle hook — stops the processor on module destruction. */
  onModuleDestroy(): void {
    this.stopProcessor();
  }

  private shouldStartProcessor(): boolean {
    if (!this.options.enabled) {
      return false;
    }
    return !this.hasProcessorStarted();
  }

  private async processPendingEvents(): Promise<void> {
    if (this.isProcessing) {
      return;
    }
    this.isProcessing = true;
    try {
      const entries = await this.repository.getPending(PENDING_BATCH_SIZE);
      for (const entry of entries) {
        await this.processSingleEntry(entry);
      }
    } finally {
      this.isProcessing = false;
    }
  }

  private async processSingleEntry(entry: OutboxEntry): Promise<void> {
    try {
      await this.publishEntry(entry);
      await this.onPublishSuccess(entry);
    } catch (error: unknown) {
      await this.onPublishError(entry, error);
    }
  }

  private async publishEntry(entry: OutboxEntry): Promise<void> {
    await this.producerService.publish(entry.subject, parseEnvelope(entry));
  }

  private async onPublishSuccess(entry: OutboxEntry): Promise<void> {
    await this.repository.markAsSent(entry.id);
    this.logger.logOutboxProcessed(toOutboxLogContext(entry));
  }

  private async onPublishError(entry: OutboxEntry, error: unknown): Promise<void> {
    const nextAttempt = entry.attempts + 1;
    await this.repository.markAsFailed(entry.id, extractErrorMessage(error));
    this.logger.logOutboxFailed(toOutboxErrorLogContext({ entry, attempt: nextAttempt, error }));
    if (this.shouldRouteToDlq(nextAttempt)) {
      await this.routeToDlq(entry, error);
      return;
    }
    await delay(calculateBackoff(nextAttempt, this.options.retryBackoffBaseMs));
  }

  private async routeToDlq(entry: OutboxEntry, lastError: unknown): Promise<void> {
    const dlqSubject = this.options.dlqSubjectBuilder(entry.subject);
    const dlqEnvelope = createDlqEnvelope(parseEnvelope(entry), buildDlqPayload(entry, lastError));
    await this.producerService.publish(dlqSubject, dlqEnvelope);
    await this.repository.markAsSent(entry.id);
    this.logger.logOutboxDlq(toOutboxErrorLogContext({ entry, attempt: entry.attempts + 1, error: lastError }));
  }

  private shouldRouteToDlq(nextAttempt: number): boolean {
    return nextAttempt > this.options.maxRetries;
  }

  private hasProcessorStarted(): boolean {
    return this.processorIntervalId !== null;
  }
}
