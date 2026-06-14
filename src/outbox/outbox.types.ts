import { EventEnvelope } from '../common/envelope/event-envelope.class';
import { Type, DynamicModule, ForwardReference } from '@nestjs/common';
import { OutboxServiceOptions } from './outbox-service-options.interface';

/** Injection token for the OutboxRepository provider selected by the module configuration. */
export const OUTBOX_REPOSITORY_TOKEN = 'OUTBOX_REPOSITORY';

/** Represents a single row in the outbox persistence table. */
export interface OutboxEntry {
  /** Unique event identifier (matches {@link EventEnvelope.id}). */
  id: string;
  /** Serialized JSON of the full event envelope. */
  eventData: string;
  /** NATS subject the event will be published to. */
  subject: string;
  /** Optional serialized metadata. */
  metadata: string | null;
  /** Current processing status. */
  status: 'pending' | 'sent' | 'failed';
  /** Number of delivery attempts made. */
  attempts: number;
  /** Error message from the last failed attempt. */
  lastError: string | null;
  /** ISO-8601 creation timestamp. */
  createdAt: string;
  /** ISO-8601 last-update timestamp. */
  updatedAt: string;
}

/** Parameters for persisting an event to the outbox. */
export interface SaveOutboxEntryParams {
  event: EventEnvelope<unknown>;
  subject: string;
  metadata?: unknown;
}

/** Persistence contract for the outbox module. */
export interface OutboxRepository {
  /** Persists a new event to the outbox with `pending` status. */
  save(params: SaveOutboxEntryParams): Promise<void>;
  /** Retrieves pending entries ordered by creation time, up to `limit`. */
  getPending(limit?: number): Promise<OutboxEntry[]>;
  /** Marks an entry as successfully delivered. */
  markAsSent(id: string): Promise<void>;
  /**
   * Records a failed attempt, incrementing the attempt counter while keeping
   * the entry in `pending` status so the processor can retry it.
   */
  markAsFailed(id: string, error: string): Promise<void>;
}

/** Minimal contract for a TypeORM-like query executor. Avoids direct TypeORM dependency. */
export interface EntityManagerLike {
  query(sql: string, parameters?: unknown[]): Promise<unknown>;
}

/** Synchronous options for OutboxModule.forRoot. */
export interface OutboxModuleOptions {
  type: 'sqlite' | 'postgres';
  sqlite?: { dbPath: string };
  postgres?: { entityManager: EntityManagerLike };
  /** Optional configuration for the OutboxService background processor. */
  serviceOptions?: OutboxServiceOptions;
}

/** Asynchronous options for OutboxModule.forRootAsync. */
export interface OutboxModuleAsyncOptions {
  imports?: Array<Type<unknown> | DynamicModule | Promise<DynamicModule> | ForwardReference<unknown>>;
  useFactory: (...args: unknown[]) => Promise<OutboxModuleOptions> | OutboxModuleOptions;
  inject?: Array<string | symbol | Type<unknown>>;
}
