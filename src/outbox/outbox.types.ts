import { EventEnvelope } from '../common/envelope/event-envelope.class';
import { Type, DynamicModule, ForwardReference } from '@nestjs/common';

/** Injection token for the OutboxRepository provider selected by the module configuration. */
export const OUTBOX_REPOSITORY_TOKEN = 'OUTBOX_REPOSITORY';

/** Represents a single row in the outbox persistence table. */
export interface OutboxEntry {
  id: string;
  eventData: string;
  subject: string;
  metadata: string | null;
  status: 'pending' | 'sent' | 'failed';
  attempts: number;
  lastError: string | null;
  createdAt: string;
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
  save(params: SaveOutboxEntryParams): Promise<void>;
  getPending(limit?: number): Promise<OutboxEntry[]>;
  markAsSent(id: string): Promise<void>;
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
}

/** Asynchronous options for OutboxModule.forRootAsync. */
export interface OutboxModuleAsyncOptions {
  imports?: Array<Type<unknown> | DynamicModule | Promise<DynamicModule> | ForwardReference<unknown>>;
  useFactory: (...args: unknown[]) => Promise<OutboxModuleOptions> | OutboxModuleOptions;
  inject?: Array<string | symbol | Type<unknown>>;
}