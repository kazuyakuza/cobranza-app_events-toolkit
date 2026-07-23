import { DynamicModule, Module, Provider } from '@nestjs/common';
import {
  IDEMPOTENCY_REPOSITORY_TOKEN,
  IdempotencyRepository,
  IdempotencyModuleOptions,
  IdempotencyModuleAsyncOptions,
} from './idempotency.types';
import { IdempotencyService } from './idempotency.service';
import { IDEMPOTENCY_SERVICE_DEPS_TOKEN, IdempotencyServiceDeps } from './idempotency-service-deps.interface';
import { IDEMPOTENCY_SERVICE_OPTIONS_TOKEN, IdempotencyServiceOptions } from './idempotency-service-options.interface';
import { EventLoggerService } from '../logging/event-logger.service';
import { SqliteIdempotencyRepository } from './sqlite-idempotency.repository';
import { PostgresIdempotencyRepository } from './postgres-idempotency.repository';
import { MemoryIdempotencyRepository } from './memory-idempotency.repository';

const IDEMPOTENCY_MODULE_OPTIONS_TOKEN = 'IDEMPOTENCY_MODULE_OPTIONS';
const IDEMPOTENCY_REPO_CONFIG_TOKEN = 'IDEMPOTENCY_REPO_CONFIG';

function resolveRepository(options: IdempotencyModuleOptions): IdempotencyRepository {
  if (options.type === 'postgres') {
    return resolvePostgresRepository(options.postgres);
  }
  if (options.type === 'memory') {
    return new MemoryIdempotencyRepository();
  }
  const dbPath = options.sqlite?.dbPath ?? ':memory:';
  return new SqliteIdempotencyRepository(dbPath);
}

function resolvePostgresRepository(
  postgres?: IdempotencyModuleOptions['postgres'],
): IdempotencyRepository {
  if (!postgres?.entityManager) {
    throw new Error('IdempotencyModule with type "postgres" requires options.postgres.entityManager');
  }
  return new PostgresIdempotencyRepository(postgres.entityManager);
}

function buildRepoConfigProvider(): Provider {
  return {
    provide: IDEMPOTENCY_REPO_CONFIG_TOKEN,
    useFactory: (
      repository: IdempotencyRepository,
      serviceOpts: IdempotencyServiceOptions,
    ) => ({ repository, options: serviceOpts }),
    inject: [IDEMPOTENCY_REPOSITORY_TOKEN, IDEMPOTENCY_SERVICE_OPTIONS_TOKEN],
  };
}

function buildDepsProvider(): Provider {
  return {
    provide: IDEMPOTENCY_SERVICE_DEPS_TOKEN,
    useFactory: (
      repoConfig: { repository: IdempotencyRepository; options: IdempotencyServiceOptions },
      logger: EventLoggerService,
    ): IdempotencyServiceDeps => ({
      repository: repoConfig.repository,
      options: repoConfig.options,
      logger,
    }),
    inject: [IDEMPOTENCY_REPO_CONFIG_TOKEN, EventLoggerService],
  };
}

/**
 * NestJS dynamic module providing idempotency support.
 *
 * Registers a global {@link IdempotencyRepository} provider backed by SQLite,
 * PostgreSQL, or an in-memory store, alongside an {@link IdempotencyService}
 * for deduplication checks and convenience wrappers.
 *
 * @see {@link OutboxModule} for the analogous outbox module.
 *
 * @example Synchronous registration (SQLite)
 * ```ts
 * IdempotencyModule.forRoot({ type: 'sqlite', sqlite: { dbPath: './keys.db' } })
 * ```
 *
 * @example Synchronous registration (PostgreSQL)
 * ```ts
 * IdempotencyModule.forRoot({
 *   type: 'postgres',
 *   postgres: { entityManager: dataSource.manager },
 *   serviceOptions: { defaultTtlSeconds: 86400 },
 * })
 * ```
 *
 * @example Asynchronous registration
 * ```ts
 * IdempotencyModule.forRootAsync({
 *   imports: [ConfigModule],
 *   useFactory: (config: ConfigService) => ({
 *     type: 'sqlite',
 *     sqlite: { dbPath: config.get('IDEMPOTENCY_DB_PATH') },
 *   }),
 *   inject: [ConfigService],
 * })
 * ```
 */
@Module({})
export class IdempotencyModule {
  /**
   * Registers the idempotency module with static configuration.
   *
   * @param options - Backend type, connection settings, and optional service config.
   * @returns A global `DynamicModule` exporting {@link IdempotencyService} and
   *   the {@link IDEMPOTENCY_REPOSITORY_TOKEN} provider.
   * @throws {Error} When `type` is `'postgres'` but `options.postgres.entityManager` is missing.
   */
  static forRoot(options: IdempotencyModuleOptions): DynamicModule {
    const repository = resolveRepository(options);

    const serviceOptionsProvider: Provider = {
      provide: IDEMPOTENCY_SERVICE_OPTIONS_TOKEN,
      useValue: options.serviceOptions ?? {},
    };

    return {
      module: IdempotencyModule,
      global: true,
      providers: [
        { provide: IDEMPOTENCY_REPOSITORY_TOKEN, useValue: repository },
        serviceOptionsProvider,
        buildRepoConfigProvider(),
        buildDepsProvider(),
        IdempotencyService,
      ],
      exports: [IDEMPOTENCY_REPOSITORY_TOKEN, IdempotencyService],
    };
  }

  /**
   * Registers the idempotency module with asynchronous configuration.
   *
   * Supports `useFactory` with dependency injection, allowing options
   * to be resolved from config services or other providers at runtime.
   *
   * @param asyncOptions - Factory-based configuration with optional module imports.
   * @returns A global `DynamicModule` exporting {@link IdempotencyService} and
   *   the {@link IDEMPOTENCY_REPOSITORY_TOKEN} provider.
   */
  static forRootAsync(asyncOptions: IdempotencyModuleAsyncOptions): DynamicModule {
    const moduleOptionsProvider: Provider = {
      provide: IDEMPOTENCY_MODULE_OPTIONS_TOKEN,
      useFactory: async (...args: unknown[]): Promise<IdempotencyModuleOptions> =>
        asyncOptions.useFactory(...args),
      inject: asyncOptions.inject ?? [],
    };

    const repositoryProvider: Provider = {
      provide: IDEMPOTENCY_REPOSITORY_TOKEN,
      useFactory: (moduleOptions: IdempotencyModuleOptions): IdempotencyRepository =>
        resolveRepository(moduleOptions),
      inject: [IDEMPOTENCY_MODULE_OPTIONS_TOKEN],
    };

    const serviceOptionsProvider: Provider = {
      provide: IDEMPOTENCY_SERVICE_OPTIONS_TOKEN,
      useFactory: (moduleOptions: IdempotencyModuleOptions): IdempotencyServiceOptions =>
        moduleOptions.serviceOptions ?? {},
      inject: [IDEMPOTENCY_MODULE_OPTIONS_TOKEN],
    };

    return {
      module: IdempotencyModule,
      global: true,
      imports: [...(asyncOptions.imports ?? [])],
      providers: [
        moduleOptionsProvider,
        repositoryProvider,
        serviceOptionsProvider,
        buildRepoConfigProvider(),
        buildDepsProvider(),
        IdempotencyService,
      ],
      exports: [IDEMPOTENCY_REPOSITORY_TOKEN, IdempotencyService],
    };
  }
}
