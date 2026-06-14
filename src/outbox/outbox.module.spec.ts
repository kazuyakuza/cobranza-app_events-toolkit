import { OutboxModule } from './outbox.module';
import { OUTBOX_REPOSITORY_TOKEN, OutboxRepository } from './outbox.types';
import { PostgresOutboxRepository } from './postgres-outbox.repository';

jest.mock('./sqlite-outbox.repository', () => {
  const mockRepo = {
    save: jest.fn(),
    getPending: jest.fn(),
    markAsSent: jest.fn(),
    markAsFailed: jest.fn(),
  };
  return {
    SqliteOutboxRepository: jest.fn().mockImplementation(() => mockRepo),
  };
});

import { SqliteOutboxRepository } from './sqlite-outbox.repository';

describe('OutboxModule', () => {
  describe('forRoot', () => {
    it('should create SqliteOutboxRepository with default :memory: path', () => {
      const dynamicModule = OutboxModule.forRoot({ type: 'sqlite' });
      const provider = dynamicModule.providers?.find(
        (p) => 'provide' in p && p.provide === OUTBOX_REPOSITORY_TOKEN,
      ) as { provide: string; useValue: OutboxRepository };

      expect(provider).toBeDefined();
      expect(SqliteOutboxRepository).toHaveBeenCalledWith(':memory:');
    });

    it('should create SqliteOutboxRepository with custom dbPath', () => {
      const dynamicModule = OutboxModule.forRoot({ type: 'sqlite', sqlite: { dbPath: '/tmp/test.db' } });
      const provider = dynamicModule.providers?.find(
        (p) => 'provide' in p && p.provide === OUTBOX_REPOSITORY_TOKEN,
      ) as { provide: string; useValue: OutboxRepository };

      expect(provider).toBeDefined();
      expect(SqliteOutboxRepository).toHaveBeenCalledWith('/tmp/test.db');
    });

    it('should create PostgresOutboxRepository when type is postgres', () => {
      const mockEntityManager = { query: jest.fn() };
      const dynamicModule = OutboxModule.forRoot({
        type: 'postgres',
        postgres: { entityManager: mockEntityManager },
      });
      const provider = dynamicModule.providers?.find(
        (p) => 'provide' in p && p.provide === OUTBOX_REPOSITORY_TOKEN,
      ) as { provide: string; useValue: OutboxRepository };

      expect(provider).toBeDefined();
      expect(provider.useValue).toBeInstanceOf(PostgresOutboxRepository);
    });

    it('should throw if postgres type has no entityManager', () => {
      expect(() => OutboxModule.forRoot({ type: 'postgres' })).toThrow(
        'OutboxModule with type "postgres" requires options.postgres.entityManager',
      );
    });

    it('should export OUTBOX_REPOSITORY_TOKEN', () => {
      const dynamicModule = OutboxModule.forRoot({ type: 'sqlite' });
      expect(dynamicModule.exports).toContain(OUTBOX_REPOSITORY_TOKEN);
    });

    it('should be a global module', () => {
      const dynamicModule = OutboxModule.forRoot({ type: 'sqlite' });
      expect(dynamicModule.global).toBe(true);
    });
  });

  describe('forRootAsync', () => {
    it('should resolve options from factory', async () => {
      const dynamicModule = OutboxModule.forRootAsync({
        useFactory: async () => ({ type: 'sqlite' }) as const,
      });

      const optionsProvider = dynamicModule.providers?.find(
        (p) => 'provide' in p && p.provide === 'OUTBOX_MODULE_OPTIONS',
      ) as { provide: string; useFactory: () => Promise<unknown> };

      const resolved = await optionsProvider.useFactory();
      expect(resolved).toEqual({ type: 'sqlite' });
    });

    it('should pass inject dependencies to factory', () => {
      const dynamicModule = OutboxModule.forRootAsync({
        useFactory: async () => ({ type: 'sqlite' }),
        inject: ['SOME_TOKEN'],
      });

      const optionsProvider = dynamicModule.providers?.find(
        (p) => 'provide' in p && p.provide === 'OUTBOX_MODULE_OPTIONS',
      ) as { provide: string; inject: unknown[] };

      expect(optionsProvider.inject).toEqual(['SOME_TOKEN']);
    });

    it('should export OUTBOX_REPOSITORY_TOKEN', () => {
      const dynamicModule = OutboxModule.forRootAsync({
        useFactory: async () => ({ type: 'sqlite' }),
      });
      expect(dynamicModule.exports).toContain(OUTBOX_REPOSITORY_TOKEN);
    });

    it('should be a global module', () => {
      const dynamicModule = OutboxModule.forRootAsync({
        useFactory: async () => ({ type: 'sqlite' }),
      });
      expect(dynamicModule.global).toBe(true);
    });
  });
});
