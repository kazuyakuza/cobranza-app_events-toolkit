import { DynamicModule, Module, Provider } from '@nestjs/common';
import {
  OUTBOX_REPOSITORY_TOKEN,
  OutboxRepository,
  OutboxModuleOptions,
  OutboxModuleAsyncOptions,
} from './outbox.types';
import { OutboxService } from './outbox.service';
import { OUTBOX_SERVICE_DEPS_TOKEN, OutboxServiceDeps } from './outbox-service-deps.interface';
import { OUTBOX_SERVICE_OPTIONS_TOKEN, OutboxServiceOptions } from './outbox-service-options.interface';
import { ProducerService } from '../producer/producer.service';
import { EventLoggerService } from '../logging/event-logger.service';
import { SqliteOutboxRepository } from './sqlite-outbox.repository';
import { PostgresOutboxRepository } from './postgres-outbox.repository';

const OUTBOX_MODULE_OPTIONS_TOKEN = 'OUTBOX_MODULE_OPTIONS';
const OUTBOX_SERVICE_BASE_DEPS_PAIR_TOKEN = 'OUTBOX_SERVICE_BASE_DEPS_PAIR';
const OUTBOX_SERVICE_CONFIG_PAIR_TOKEN = 'OUTBOX_SERVICE_CONFIG_PAIR';

type OutboxServiceBaseDepsPair = Pick<OutboxServiceDeps, 'producerService' | 'logger'>;
type OutboxServiceConfigPair = Pick<OutboxServiceDeps, 'repository' | 'options'>;

function resolveRepository(options: OutboxModuleOptions): OutboxRepository {
  if (options.type === 'postgres') {
    if (!options.postgres?.entityManager) {
      throw new Error('OutboxModule with type "postgres" requires options.postgres.entityManager');
    }
    return new PostgresOutboxRepository(options.postgres.entityManager);
  }
  const dbPath = options.sqlite?.dbPath ?? ':memory:';
  return new SqliteOutboxRepository(dbPath);
}

/**
 * NestJS dynamic module that provides the transactional outbox pattern.
 *
 * Registers a global OutboxRepository provider backed by either
 * SQLite or PostgreSQL, and an OutboxService for background processing,
 * both configurable via OutboxModuleOptions.
 *
 * @example Synchronous registration
 * ```ts
 * OutboxModule.forRoot({ type: 'sqlite', sqlite: { dbPath: './outbox.db' } })
 * ```
 */
@Module({})
export class OutboxModule {
  /**
   * Registers the outbox module with static configuration.
   *
   * @param options - Database type, connection settings, and optional service config.
   */
  static forRoot(options: OutboxModuleOptions): DynamicModule {
    const repository = resolveRepository(options);

    const serviceOptionsProvider: Provider = {
      provide: OUTBOX_SERVICE_OPTIONS_TOKEN,
      useValue: options.serviceOptions ?? {},
    };

    const baseDepsPairProvider: Provider = {
      provide: OUTBOX_SERVICE_BASE_DEPS_PAIR_TOKEN,
      useFactory: (producerService: ProducerService, logger: EventLoggerService): OutboxServiceBaseDepsPair => ({
        producerService,
        logger,
      }),
      inject: [ProducerService, EventLoggerService],
    };

    const configPairProvider: Provider = {
      provide: OUTBOX_SERVICE_CONFIG_PAIR_TOKEN,
      useFactory: (repository: OutboxRepository, serviceOpts: OutboxServiceOptions): OutboxServiceConfigPair => ({
        repository,
        options: serviceOpts,
      }),
      inject: [OUTBOX_REPOSITORY_TOKEN, OUTBOX_SERVICE_OPTIONS_TOKEN],
    };

    const depsProvider: Provider = {
      provide: OUTBOX_SERVICE_DEPS_TOKEN,
      useFactory: (base: OutboxServiceBaseDepsPair, config: OutboxServiceConfigPair): OutboxServiceDeps => ({
        ...base,
        ...config,
      }),
      inject: [OUTBOX_SERVICE_BASE_DEPS_PAIR_TOKEN, OUTBOX_SERVICE_CONFIG_PAIR_TOKEN],
    };

    return {
      module: OutboxModule,
      global: true,
      providers: [
        { provide: OUTBOX_REPOSITORY_TOKEN, useValue: repository },
        serviceOptionsProvider,
        baseDepsPairProvider,
        configPairProvider,
        depsProvider,
        OutboxService,
      ],
      exports: [OUTBOX_REPOSITORY_TOKEN, OutboxService],
    };
  }

  /**
   * Registers the outbox module with asynchronous configuration.
   *
   * Supports useFactory with dependency injection, allowing options
   * to be resolved from config services or other providers at runtime.
   *
   * @param asyncOptions - Factory-based configuration with optional module imports.
   */
  static forRootAsync(asyncOptions: OutboxModuleAsyncOptions): DynamicModule {
    const moduleOptionsProvider: Provider = {
      provide: OUTBOX_MODULE_OPTIONS_TOKEN,
      useFactory: async (...args: unknown[]): Promise<OutboxModuleOptions> => asyncOptions.useFactory(...args),
      inject: asyncOptions.inject ?? [],
    };

    const repositoryProvider: Provider = {
      provide: OUTBOX_REPOSITORY_TOKEN,
      useFactory: (moduleOptions: OutboxModuleOptions): OutboxRepository => resolveRepository(moduleOptions),
      inject: [OUTBOX_MODULE_OPTIONS_TOKEN],
    };

    const serviceOptionsProvider: Provider = {
      provide: OUTBOX_SERVICE_OPTIONS_TOKEN,
      useFactory: (moduleOptions: OutboxModuleOptions): OutboxServiceOptions => moduleOptions.serviceOptions ?? {},
      inject: [OUTBOX_MODULE_OPTIONS_TOKEN],
    };

    const baseDepsPairProvider: Provider = {
      provide: OUTBOX_SERVICE_BASE_DEPS_PAIR_TOKEN,
      useFactory: (producerService: ProducerService, logger: EventLoggerService): OutboxServiceBaseDepsPair => ({
        producerService,
        logger,
      }),
      inject: [ProducerService, EventLoggerService],
    };

    const configPairProvider: Provider = {
      provide: OUTBOX_SERVICE_CONFIG_PAIR_TOKEN,
      useFactory: (repository: OutboxRepository, serviceOpts: OutboxServiceOptions): OutboxServiceConfigPair => ({
        repository,
        options: serviceOpts,
      }),
      inject: [OUTBOX_REPOSITORY_TOKEN, OUTBOX_SERVICE_OPTIONS_TOKEN],
    };

    const depsProvider: Provider = {
      provide: OUTBOX_SERVICE_DEPS_TOKEN,
      useFactory: (base: OutboxServiceBaseDepsPair, config: OutboxServiceConfigPair): OutboxServiceDeps => ({
        ...base,
        ...config,
      }),
      inject: [OUTBOX_SERVICE_BASE_DEPS_PAIR_TOKEN, OUTBOX_SERVICE_CONFIG_PAIR_TOKEN],
    };

    return {
      module: OutboxModule,
      global: true,
      imports: [...(asyncOptions.imports ?? [])],
      providers: [
        moduleOptionsProvider,
        repositoryProvider,
        serviceOptionsProvider,
        baseDepsPairProvider,
        configPairProvider,
        depsProvider,
        OutboxService,
      ],
      exports: [OUTBOX_REPOSITORY_TOKEN, OutboxService],
    };
  }
}
