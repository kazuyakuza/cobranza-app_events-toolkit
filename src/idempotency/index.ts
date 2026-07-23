/**
 * @packageDocumentation
 *
 * Public API for the idempotency module — idempotent event processing support.
 *
 * Provides {@link IdempotencyModule} for NestJS registration, {@link IdempotencyService}
 * for deduplication checks, and repository implementations for SQLite, PostgreSQL,
 * and in-memory (testing) backends.
 *
 * @see {@link module:outbox} for the analogous outbox module.
 */
export { IdempotencyModule } from './idempotency.module';
export {
  IDEMPOTENCY_REPOSITORY_TOKEN,
  IdempotencyRepository,
  IdempotencyEntry,
  IdempotencyModuleOptions,
  IdempotencyModuleAsyncOptions,
} from './idempotency.types';
export { SqliteIdempotencyRepository } from './sqlite-idempotency.repository';
export { PostgresIdempotencyRepository } from './postgres-idempotency.repository';
export { MemoryIdempotencyRepository } from './memory-idempotency.repository';
export { IdempotencyService } from './idempotency.service';
export { IdempotencyServiceDeps, IDEMPOTENCY_SERVICE_DEPS_TOKEN } from './idempotency-service-deps.interface';
export { IdempotencyServiceOptions, IDEMPOTENCY_SERVICE_OPTIONS_TOKEN } from './idempotency-service-options.interface';
export { buildIdempotencyKey } from './build-idempotency-key.util';
