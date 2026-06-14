import { Injectable, Inject, OnModuleDestroy } from '@nestjs/common';
import { EventEnvelope } from '../common/envelope/event-envelope.class';
import { OutboxLogContext, OutboxErrorLogContext } from '../logging/event-logger.service';
import { OutboxEntry } from './outbox.types';
import { OutboxServiceDeps, OUTBOX_SERVICE_DEPS_TOKEN } from './outbox-service-deps.interface';
import { OutboxServiceOptions } from './outbox-service-options.interface';
import { buildDlqSubject } from './outbox.utils';

/** Default processor configuration values. */
const DEFAULTS: Required<OutboxServiceOptions> = {
  enabled: true,
  processorIntervalMs: 5000,
  maxRetries: 3,
  retryBackoffBaseMs: 1000,
  dlqSubjectBuilder: buildDlqSubject,
};

/** Default batch size for pending event retrieval. */
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
    this.logOutboxSaved(event, subject);
  }

  /** Starts the background processor that polls for pending outbox events. */
  startProcessor(): void {
    if (!this.options.enabled || this.hasProcessorStarted()) {
      return;
    }
    this.processorIntervalId = setInterval(() => {
      this.processPendingEvents().catch((error: unknown) => this.logProcessorError(error));
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

  /** Processes a batch of pending outbox entries. */
  private async processPendingEvents(): Promise<void> {
    if (this.isProcessing) {
      return;
    }
    this.isProcessing = true;
    const entries = await this.repository.getPending(PENDING_BATCH_SIZE);
    for (const entry of entries) {
      await this.processSingleEntry(entry);
    }
    this.isProcessing = false;
  }

  /** Handles a single outbox entry through publish → success or failure path. */
  private async processSingleEntry(entry: OutboxEntry): Promise<void> {
    try {
      await this.publishEntry(entry);
      await this.onPublishSuccess(entry);
    } catch (error: unknown) {
      await this.onPublishError(entry, error);
    }
  }

  /** Publishes the event stored in an outbox entry via ProducerService. */
  private async publishEntry(entry: OutboxEntry): Promise<void> {
    const envelope = this.parseEnvelope(entry);
    await this.producerService.publish(entry.subject, envelope);
  }

  /** Marks an entry as sent and logs the successful processing. */
  private async onPublishSuccess(entry: OutboxEntry): Promise<void> {
    await this.repository.markAsSent(entry.id);
    this.logger.logOutboxProcessed(this.toOutboxLogContext(entry));
  }

  /** Handles a publish failure — retries with backoff or routes to DLQ. */
  private async onPublishError(entry: OutboxEntry, error: unknown): Promise<void> {
    const nextAttempt = entry.attempts + 1;
    await this.repository.markAsFailed(entry.id, this.extractErrorMessage(error));
    this.logger.logOutboxFailed(this.toOutboxErrorLogContext(entry, nextAttempt, error));
    if (this.shouldRouteToDlq(nextAttempt)) {
      await this.routeToDlq(entry, error);
      return;
    }
    await this.delay(this.calculateBackoff(nextAttempt));
  }

  /** Routes an outbox entry to the Dead Letter Queue after exhausting retries. */
  private async routeToDlq(entry: OutboxEntry, lastError: unknown): Promise<void> {
    const dlqSubject = this.options.dlqSubjectBuilder(entry.subject);
    const envelope = this.parseEnvelope(entry);
    const dlqPayload = this.buildDlqPayload(entry, lastError);
    const dlqEnvelope = new EventEnvelope<unknown>({
      id: envelope.id,
      produced_at: new Date().toISOString(),
      type: envelope.type,
      version: envelope.version,
      producer: envelope.producer,
      company_id: envelope.company_id,
      actor_type: envelope.actor_type,
      actor_id: envelope.actor_id,
      correlation_id: envelope.correlation_id,
      causation_id: envelope.causation_id,
      trace_id: envelope.trace_id,
      data: dlqPayload,
    });
    await this.producerService.publish(dlqSubject, dlqEnvelope);
    await this.repository.markAsSent(entry.id);
    this.logger.logOutboxDlq(this.toOutboxErrorLogContext(entry, entry.attempts + 1, lastError));
  }

  /** Calculates exponential backoff delay: base * 2^(attempt-1). */
  private calculateBackoff(attempt: number): number {
    return this.options.retryBackoffBaseMs * Math.pow(2, attempt - 1);
  }

  /** Parses the serialized event data from an outbox entry back into an EventEnvelope. */
  private parseEnvelope(entry: OutboxEntry): EventEnvelope<unknown> {
    return JSON.parse(entry.eventData) as EventEnvelope<unknown>;
  }

  /** Checks whether the next attempt exceeds the maximum retry count. */
  private shouldRouteToDlq(nextAttempt: number): boolean {
    return nextAttempt > this.options.maxRetries;
  }

  /** Checks if the processor interval has already been started. */
  private hasProcessorStarted(): boolean {
    return this.processorIntervalId !== null;
  }

  /** Returns a human-readable error message from an unknown error value. */
  private extractErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }

  /** Creates a promise that resolves after the given milliseconds. */
  private delay(milliseconds: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
  }

  /** Builds the DLQ payload object from an outbox entry and the last error. */
  private buildDlqPayload(entry: OutboxEntry, lastError: unknown): Record<string, unknown> {
    const err = lastError instanceof Error ? lastError : new Error(String(lastError));
    return {
      originalSubject: entry.subject,
      originalEvent: JSON.parse(entry.eventData),
      error: { name: err.name, message: err.message, stack: err.stack },
      attempts: entry.attempts + 1,
      failedAt: new Date().toISOString(),
    };
  }

  /** Logs the successful persistence of an event to the outbox. */
  private logOutboxSaved(event: EventEnvelope<unknown>, subject: string): void {
    this.logger.logOutboxSaved({
      eventId: event.id,
      eventType: event.type,
      subject,
      attempt: 0,
      correlationId: event.correlation_id,
      traceId: event.trace_id,
    });
  }

  /** Converts an OutboxEntry into an OutboxLogContext for success logging. */
  private toOutboxLogContext(entry: OutboxEntry): OutboxLogContext {
    const envelope = this.parseEnvelope(entry);
    return {
      eventId: entry.id,
      eventType: envelope.type,
      subject: entry.subject,
      attempt: entry.attempts + 1,
      correlationId: envelope.correlation_id,
      traceId: envelope.trace_id,
    };
  }

  /** Converts an OutboxEntry into an OutboxErrorLogContext for error/DLQ logging. */
  private toOutboxErrorLogContext(entry: OutboxEntry, attempt: number, error: unknown): OutboxErrorLogContext {
    const err = error instanceof Error ? error : new Error(String(error));
    return {
      ...this.toOutboxLogContext(entry),
      attempt,
      error: err.message,
      stack: err.stack,
    };
  }

  /** Logs an unexpected processor-level error. */
  private logProcessorError(error: unknown): void {
    const err = error instanceof Error ? error : new Error(String(error));
    this.logger.logEventError({
      eventId: 'unknown',
      eventType: 'unknown',
      subject: 'outbox-processor',
      error: err.message,
      stack: err.stack,
    });
  }
}
