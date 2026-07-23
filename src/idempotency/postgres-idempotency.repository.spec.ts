import { PostgresIdempotencyRepository } from './postgres-idempotency.repository';

describe('PostgresIdempotencyRepository', () => {
  let entityManager: { query: jest.Mock };
  let repository: PostgresIdempotencyRepository;

  beforeEach(() => {
    entityManager = { query: jest.fn().mockResolvedValue([]) };
    repository = new PostgresIdempotencyRepository(entityManager);
  });

  describe('isProcessed', () => {
    it('ensures table before querying', async () => {
      await repository.isProcessed('test-key');
      expect(entityManager.query).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining('CREATE TABLE IF NOT EXISTS idempotency_keys'),
      );
    });

    it('runs SELECT with key and nowIso and returns false for empty result', async () => {
      const result = await repository.isProcessed('test-key');
      expect(entityManager.query).toHaveBeenCalledWith(expect.stringContaining('SELECT 1 FROM idempotency_keys'), [
        'test-key',
        expect.any(String),
      ]);
      expect(result).toBe(false);
    });

    it('returns true when rows are found', async () => {
      entityManager.query.mockResolvedValueOnce(undefined).mockResolvedValueOnce([{ '?column?': 1 }]);
      const result = await repository.isProcessed('existing-key');
      expect(result).toBe(true);
    });

    it('caches table creation flag after first call', async () => {
      await repository.isProcessed('key-a');
      await repository.isProcessed('key-b');
      expect(entityManager.query).toHaveBeenCalledTimes(3);
      expect(entityManager.query).toHaveBeenNthCalledWith(1, expect.stringContaining('CREATE TABLE'));
    });
  });

  describe('markAsProcessed', () => {
    it('ensures table and inserts with ON CONFLICT DO NOTHING', async () => {
      await repository.markAsProcessed('test-key', 3600);
      expect(entityManager.query).toHaveBeenCalledWith(expect.stringContaining('ON CONFLICT (key) DO NOTHING'), [
        'test-key',
        expect.any(String),
        expect.any(String),
      ]);
    });

    it('inserts with null expires_at when no TTL', async () => {
      await repository.markAsProcessed('test-key');
      expect(entityManager.query).toHaveBeenCalledWith(expect.stringContaining('ON CONFLICT (key) DO NOTHING'), [
        'test-key',
        expect.any(String),
        null,
      ]);
    });
  });

  describe('clearExpired', () => {
    it('ensures table and deletes expired rows', async () => {
      await repository.clearExpired();
      expect(entityManager.query).toHaveBeenCalledWith(expect.stringContaining('DELETE FROM idempotency_keys'), [
        expect.any(String),
      ]);
    });
  });
});
