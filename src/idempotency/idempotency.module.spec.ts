import { IdempotencyModule } from './idempotency.module';
import { IDEMPOTENCY_REPOSITORY_TOKEN, IdempotencyRepository } from './idempotency.types';
import { PostgresIdempotencyRepository } from './postgres-idempotency.repository';

jest.mock('./sqlite-idempotency.repository', () => {
  const mockRepo = {
    isProcessed: jest.fn(),
    markAsProcessed: jest.fn(),
    clearExpired: jest.fn(),
  };
  return {
    SqliteIdempotencyRepository: jest.fn().mockImplementation(() => mockRepo),
  };
});

jest.mock('./memory-idempotency.repository', () => {
  const mockRepo = {
    isProcessed: jest.fn(),
    markAsProcessed: jest.fn(),
    clearExpired: jest.fn(),
  };
  return {
    MemoryIdempotencyRepository: jest.fn().mockImplementation(() => mockRepo),
  };
});

import { SqliteIdempotencyRepository } from './sqlite-idempotency.repository';
import { MemoryIdempotencyRepository } from './memory-idempotency.repository';

describe('IdempotencyModule', () => {
  describe('forRoot', () => {
    it('creates SqliteIdempotencyRepository with default :memory: path', () => {
      const dynamicModule = IdempotencyModule.forRoot({ type: 'sqlite' });
      const provider = dynamicModule.providers?.find(
        (p) => 'provide' in p && p.provide === IDEMPOTENCY_REPOSITORY_TOKEN,
      ) as { provide: string; useValue: IdempotencyRepository };

      expect(provider).toBeDefined();
      expect(SqliteIdempotencyRepository).toHaveBeenCalledWith(':memory:');
    });

    it('creates SqliteIdempotencyRepository with custom dbPath', () => {
      const dynamicModule = IdempotencyModule.forRoot({ type: 'sqlite', sqlite: { dbPath: '/tmp/keys.db' } });
      const provider = dynamicModule.providers?.find(
        (p) => 'provide' in p && p.provide === IDEMPOTENCY_REPOSITORY_TOKEN,
      ) as { provide: string; useValue: IdempotencyRepository };

      expect(provider).toBeDefined();
      expect(SqliteIdempotencyRepository).toHaveBeenCalledWith('/tmp/keys.db');
    });

    it('creates PostgresIdempotencyRepository when type is postgres', () => {
      const mockEntityManager = { query: jest.fn() };
      const dynamicModule = IdempotencyModule.forRoot({
        type: 'postgres',
        postgres: { entityManager: mockEntityManager },
      });
      const provider = dynamicModule.providers?.find(
        (p) => 'provide' in p && p.provide === IDEMPOTENCY_REPOSITORY_TOKEN,
      ) as { provide: string; useValue: IdempotencyRepository };

      expect(provider).toBeDefined();
      expect(provider.useValue).toBeInstanceOf(PostgresIdempotencyRepository);
    });

    it('creates MemoryIdempotencyRepository when type is memory', () => {
      const dynamicModule = IdempotencyModule.forRoot({ type: 'memory' });
      expect(MemoryIdempotencyRepository).toHaveBeenCalled();
    });

    it('throws if postgres type has no entityManager', () => {
      expect(() => IdempotencyModule.forRoot({ type: 'postgres' })).toThrow(
        'IdempotencyModule with type "postgres" requires options.postgres.entityManager',
      );
    });

    it('exports IDEMPOTENCY_REPOSITORY_TOKEN', () => {
      const dynamicModule = IdempotencyModule.forRoot({ type: 'sqlite' });
      expect(dynamicModule.exports).toContain(IDEMPOTENCY_REPOSITORY_TOKEN);
    });

    it('is a global module', () => {
      const dynamicModule = IdempotencyModule.forRoot({ type: 'sqlite' });
      expect(dynamicModule.global).toBe(true);
    });
  });

  describe('forRootAsync', () => {
    it('resolves options from factory and creates SQLite repository', async () => {
      const dynamicModule = IdempotencyModule.forRootAsync({
        useFactory: async () => ({ type: 'sqlite' }) as const,
      });

      const optionsProvider = dynamicModule.providers?.find(
        (p) => 'provide' in p && p.provide === 'IDEMPOTENCY_MODULE_OPTIONS',
      ) as { provide: string; useFactory: () => Promise<unknown> };

      expect(optionsProvider).toBeDefined();

      const resolved = await optionsProvider.useFactory();
      expect(resolved).toEqual({ type: 'sqlite' });
    });

    it('resolves options from factory and creates Postgres repository', async () => {
      const mockEntityManager = { query: jest.fn() };
      const dynamicModule = IdempotencyModule.forRootAsync({
        useFactory: async () => ({ type: 'postgres', postgres: { entityManager: mockEntityManager } }),
      });

      const repoProvider = dynamicModule.providers?.find(
        (p) => 'provide' in p && p.provide === IDEMPOTENCY_REPOSITORY_TOKEN,
      ) as { provide: string; useFactory: (opts: unknown) => IdempotencyRepository };

      const optionsProvider = dynamicModule.providers?.find(
        (p) => 'provide' in p && p.provide === 'IDEMPOTENCY_MODULE_OPTIONS',
      ) as { provide: string; useFactory: () => Promise<unknown> };

      const resolvedOptions = await optionsProvider.useFactory();
      const repo = repoProvider.useFactory(resolvedOptions);
      expect(repo).toBeInstanceOf(PostgresIdempotencyRepository);
    });

    it('includes imports from asyncOptions', () => {
      const mockModule = { module: class Mock {} };
      const dynamicModule = IdempotencyModule.forRootAsync({
        imports: [mockModule],
        useFactory: async () => ({ type: 'memory' }),
      });

      expect(dynamicModule.imports).toContain(mockModule);
    });
  });
});
