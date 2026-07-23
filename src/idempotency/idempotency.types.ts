import { Type, DynamicModule, ForwardReference } from '@nestjs/common';
import { EntityManagerLike } from '../outbox/outbox.types';
import { IdempotencyServiceOptions } from './idempotency-service-options.interface';

/**
 * Injection token for the {@link IdempotencyRepository} provider.
 *
 * @see {@link OutboxRepository} for the analogous outbox token.
 */
export const IDEMPOTENCY_REPOSITORY_TOKEN = 'IDEMPOTENCY_REPOSITORY';

/**
 * Represents a single row in the idempotency keys table.
 *
 * @see {@link IdempotencyRepository} for the persistence contract that reads/writes entries.
 */
export interface IdempotencyEntry {
  /** Deterministic idempotency key in the form `${event.id}:${event.correlation_id}`. */
  key: string;
  /** ISO-8601 creation timestamp. */
  createdAt: string;
  /** Optional ISO-8601 expiry timestamp. `null` means the entry never expires. */
  expiresAt?: string | null;
}

/**
 * Persistence contract for the idempotency module.
 *
 * Mirrors the shape of {@link import('../outbox/outbox.types').OutboxRepository | OutboxRepository}
 * but operates on idempotency keys instead of outbox entries.
 *
 * @see {@link SqliteIdempotencyRepository}
 * @see {@link PostgresIdempotencyRepository}
 * @see {@link MemoryIdempotencyRepository}
 */
export interface IdempotencyRepository {
  /** Returns `true` when the key exists and has not expired. */
  isProcessed(key: string): Promise<boolean>;
  /**
   * Inserts a key, optionally with a TTL-based expiry.
   *
   * Implementations must be idempotent — repeated calls with the same key
   * must not throw or overwrite the original row.
   */
  markAsProcessed(key: string, ttlSeconds?: number): Promise<void>;
  /** Deletes all rows whose `expires_at` is in the past. Safe to call periodically. */
  clearExpired(): Promise<void>;
}

/**
 * Synchronous options for {@link IdempotencyModule.forRoot}.
 *
 * @example SQLite backend
 * ```ts
 * { type: 'sqlite', sqlite: { dbPath: './idempotency.db' } }
 * ```
 *
 * @example PostgreSQL backend
 * ```ts
 * { type: 'postgres', postgres: { entityManager } }
 * ```
 *
 * @see {@link EventsToolkitIdempotencyOptions} for the toolkit-level wrapper.
 */
export interface IdempotencyModuleOptions {
  /** Persistence backend to use. `'memory'` is intended for testing only. */
  type: 'sqlite' | 'postgres' | 'memory';
  /** SQLite-specific settings. Required when `type` is `'sqlite'`. */
  sqlite?: { dbPath: string };
  /** PostgreSQL-specific settings. Required when `type` is `'postgres'`. */
  postgres?: { entityManager: EntityManagerLike };
  /** Optional service-level configuration (e.g. default TTL). */
  serviceOptions?: IdempotencyServiceOptions;
}

/**
 * Asynchronous options for {@link IdempotencyModule.forRootAsync}.
 *
 * Supports `useFactory` with dependency injection, allowing options to be
 * resolved from `ConfigService` or other providers at runtime.
 *
 * @see {@link IdempotencyModuleOptions} for the resolved shape.
 */
export interface IdempotencyModuleAsyncOptions {
  /** Additional NestJS modules imported to make injected dependencies available. */
  imports?: Array<Type<unknown> | DynamicModule | Promise<DynamicModule> | ForwardReference<unknown>>;
  /** Factory that resolves module options at runtime. */
  useFactory: (...args: unknown[]) => Promise<IdempotencyModuleOptions> | IdempotencyModuleOptions;
  /** Tokens to inject into the factory function. */
  inject?: Array<string | symbol | Type<unknown>>;
}
