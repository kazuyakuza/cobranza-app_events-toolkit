import { DynamicModule, Module, Provider } from '@nestjs/common';
import {
  OUTBOX_REPOSITORY_TOKEN,
  OutboxRepository,
  OutboxModuleOptions,
  OutboxModuleAsyncOptions,
} from './outbox.types';
import { SqliteOutboxRepository } from './sqlite-outbox.repository';
import { PostgresOutboxRepository } from './postgres-outbox.repository';

const OUTBOX_MODULE_OPTIONS_TOKEN = 'OUTBOX_MODULE_OPTIONS';

function resolveRepository(options: OutboxModuleOptions): OutboxRepository {
  if (options.type === 'postgres') {
    if (!options.postgres?.entityManager) {
      throw new Error(
        'OutboxModule with type "postgres" requires options.postgres.entityManager',
      );
    }
    return new PostgresOutboxRepository(options.postgres.entityManager);
  }
  const dbPath = options.sqlite?.dbPath ?? ':memory:';
  return new SqliteOutboxRepository(dbPath);
}

@Module({})
export class OutboxModule {
  static forRoot(options: OutboxModuleOptions): DynamicModule {
    const repositoryProvider: Provider = {
      provide: OUTBOX_REPOSITORY_TOKEN,
      useValue: resolveRepository(options),
    };

    return {
      module: OutboxModule,
      global: true,
      providers: [repositoryProvider],
      exports: [OUTBOX_REPOSITORY_TOKEN],
    };
  }

  static forRootAsync(asyncOptions: OutboxModuleAsyncOptions): DynamicModule {
    const optionsProvider: Provider = {
      provide: OUTBOX_MODULE_OPTIONS_TOKEN,
      useFactory: async (...args: unknown[]): Promise<OutboxModuleOptions> =>
        asyncOptions.useFactory(...args),
      inject: asyncOptions.inject ?? [],
    };

    const repositoryProvider: Provider = {
      provide: OUTBOX_REPOSITORY_TOKEN,
      useFactory: (moduleOptions: OutboxModuleOptions): OutboxRepository =>
        resolveRepository(moduleOptions),
      inject: [OUTBOX_MODULE_OPTIONS_TOKEN],
    };

    return {
      module: OutboxModule,
      global: true,
      imports: [...(asyncOptions.imports ?? [])],
      providers: [optionsProvider, repositoryProvider],
      exports: [OUTBOX_REPOSITORY_TOKEN],
    };
  }
}