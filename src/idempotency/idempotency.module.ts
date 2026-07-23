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
const IDEMPOTENCY_SERVICE_BASE_DEPS_PAIR_TOKEN = 'IDEMPOTENCY_SERVICE_BASE_DEPS_PAIR';
const IDEMPOTENCY_SERVICE_CONFIG_PAIR_TOKEN = 'IDEMPOTENCY_SERVICE_CONFIG_PAIR';

type IdempotencyServiceBaseDepsPair = Pick<IdempotencyServiceDeps, 'logger'>;
type IdempotencyServiceConfigPair = Pick<IdempotencyServiceDeps, 'repository' | 'options'>;

function resolveRepository(options: IdempotencyModuleOptions): IdempotencyRepository {
  if (options.type === 'postgres') {
    if (!options.postgres?.entityManager) {
      throw new Error('IdempotencyModule with type "postgres" requires options.postgres.entityManager');
    }
    return new PostgresIdempotencyRepository(options.postgres.entityManager);
  }
  if (options.type === 'memory') {
    return new MemoryIdempotencyRepository();
  }
  const dbPath = options.sqlite?.dbPath ?? ':memory:';
  return new SqliteIdempotencyRepository(dbPath);
}

/**
 * NestJS dynamic module providing idempotency support.
 *
 * Registers a global IdempotencyRepository provider backed by SQLite,
 * PostgreSQL, or an in-memory store, alongside an IdempotencyService
 * for deduplication checks and convenience wrappers.
 *
 * @example Synchronous registration
 * ```ts
 * IdempotencyModule.forRoot({ type: 'sqlite', sqlite: { dbPath: './keys.db' } })
 * ```
 */
@Module({})
export class IdempotencyModule {
  /**
   * Registers the idempotency module with static configuration.
   *
   * @param options - Backend type, connection settings, and optional service config.
   */
  static forRoot(options: IdempotencyModuleOptions): DynamicModule {
    const repository = resolveRepository(options);

    const serviceOptionsProvider: Provider = {
      provide: IDEMPOTENCY_SERVICE_OPTIONS_TOKEN,
      useValue: options.serviceOptions ?? {},
    };

    const baseDepsPairProvider: Provider = {
      provide: IDEMPOTENCY_SERVICE_BASE_DEPS_PAIR_TOKEN,
      useFactory: (logger: EventLoggerService): IdempotencyServiceBaseDepsPair => ({
        logger,
      }),
      inject: [EventLoggerService],
    };

    const configPairProvider: Provider = {
      provide: IDEMPOTENCY_SERVICE_CONFIG_PAIR_TOKEN,
      useFactory: (
        repository: IdempotencyRepository,
        serviceOpts: IdempotencyServiceOptions,
      ): IdempotencyServiceConfigPair => ({
        repository,
        options: serviceOpts,
      }),
      inject: [IDEMPOTENCY_REPOSITORY_TOKEN, IDEMPOTENCY_SERVICE_OPTIONS_TOKEN],
    };

    const depsProvider: Provider = {
      provide: IDEMPOTENCY_SERVICE_DEPS_TOKEN,
      useFactory: (
        base: IdempotencyServiceBaseDepsPair,
        config: IdempotencyServiceConfigPair,
      ): IdempotencyServiceDeps => ({
        ...base,
        ...config,
      }),
      inject: [IDEMPOTENCY_SERVICE_BASE_DEPS_PAIR_TOKEN, IDEMPOTENCY_SERVICE_CONFIG_PAIR_TOKEN],
    };

    return {
      module: IdempotencyModule,
      global: true,
      providers: [
        { provide: IDEMPOTENCY_REPOSITORY_TOKEN, useValue: repository },
        serviceOptionsProvider,
        baseDepsPairProvider,
        configPairProvider,
        depsProvider,
        IdempotencyService,
      ],
      exports: [IDEMPOTENCY_REPOSITORY_TOKEN, IdempotencyService],
    };
  }

  /**
   * Registers the idempotency module with asynchronous configuration.
   *
   * Supports useFactory with dependency injection, allowing options
   * to be resolved from config services or other providers at runtime.
   *
   * @param asyncOptions - Factory-based configuration with optional module imports.
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

    const baseDepsPairProvider: Provider = {
      provide: IDEMPOTENCY_SERVICE_BASE_DEPS_PAIR_TOKEN,
      useFactory: (logger: EventLoggerService): IdempotencyServiceBaseDepsPair => ({
        logger,
      }),
      inject: [EventLoggerService],
    };

    const configPairProvider: Provider = {
      provide: IDEMPOTENCY_SERVICE_CONFIG_PAIR_TOKEN,
      useFactory: (
        repository: IdempotencyRepository,
        serviceOpts: IdempotencyServiceOptions,
      ): IdempotencyServiceConfigPair => ({
        repository,
        options: serviceOpts,
      }),
      inject: [IDEMPOTENCY_REPOSITORY_TOKEN, IDEMPOTENCY_SERVICE_OPTIONS_TOKEN],
    };

    const depsProvider: Provider = {
      provide: IDEMPOTENCY_SERVICE_DEPS_TOKEN,
      useFactory: (
        base: IdempotencyServiceBaseDepsPair,
        config: IdempotencyServiceConfigPair,
      ): IdempotencyServiceDeps => ({
        ...base,
        ...config,
      }),
      inject: [IDEMPOTENCY_SERVICE_BASE_DEPS_PAIR_TOKEN, IDEMPOTENCY_SERVICE_CONFIG_PAIR_TOKEN],
    };

    return {
      module: IdempotencyModule,
      global: true,
      imports: [...(asyncOptions.imports ?? [])],
      providers: [
        moduleOptionsProvider,
        repositoryProvider,
        serviceOptionsProvider,
        baseDepsPairProvider,
        configPairProvider,
        depsProvider,
        IdempotencyService,
      ],
      exports: [IDEMPOTENCY_REPOSITORY_TOKEN, IdempotencyService],
    };
  }
}
