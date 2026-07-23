import { Type, DynamicModule, ForwardReference } from '@nestjs/common';
import { EntityManagerLike } from '../outbox/outbox.types';
import { IdempotencyServiceOptions } from './idempotency-service-options.interface';

/** Injection token for the IdempotencyRepository provider. */
export const IDEMPOTENCY_REPOSITORY_TOKEN = 'IDEMPOTENCY_REPOSITORY';

/** Represents a single row in the idempotency keys table. */
export interface IdempotencyEntry {
  /** Deterministic idempotency key (event.id:event.correlation_id). */
  key: string;
  /** ISO-8601 creation timestamp. */
  createdAt: string;
  /** Optional ISO-8601 expiry timestamp. */
  expiresAt?: string | null;
}

/** Persistence contract for the idempotency module. */
export interface IdempotencyRepository {
  /** Returns true when the key exists and has not expired. */
  isProcessed(key: string): Promise<boolean>;
  /** Inserts a key, optionally with a TTL-based expiry. */
  markAsProcessed(key: string, ttlSeconds?: number): Promise<void>;
  /** Deletes all rows where expires_at is in the past. */
  clearExpired(): Promise<void>;
}

/** Synchronous options for IdempotencyModule.forRoot. */
export interface IdempotencyModuleOptions {
  type: 'sqlite' | 'postgres' | 'memory';
  sqlite?: { dbPath: string };
  postgres?: { entityManager: EntityManagerLike };
  serviceOptions?: IdempotencyServiceOptions;
}

/** Asynchronous options for IdempotencyModule.forRootAsync. */
export interface IdempotencyModuleAsyncOptions {
  imports?: Array<Type<unknown> | DynamicModule | Promise<DynamicModule> | ForwardReference<unknown>>;
  useFactory: (...args: unknown[]) => Promise<IdempotencyModuleOptions> | IdempotencyModuleOptions;
  inject?: Array<string | symbol | Type<unknown>>;
}
