import { SqliteIdempotencyRepository } from './sqlite-idempotency.repository';

describe('SqliteIdempotencyRepository', () => {
  let repository: SqliteIdempotencyRepository;

  beforeEach(() => {
    repository = new SqliteIdempotencyRepository(':memory:');
  });

  it('isProcessed returns false for unknown key', async () => {
    expect(await repository.isProcessed('missing')).toBe(false);
  });

  it('isProcessed returns true after markAsProcessed', async () => {
    await repository.markAsProcessed('key');
    expect(await repository.isProcessed('key')).toBe(true);
  });

  it('second markAsProcessed is a no-op', async () => {
    await repository.markAsProcessed('key', 3600);
    await repository.markAsProcessed('key', 3600);
    expect(await repository.isProcessed('key')).toBe(true);
  });

  it('isProcessed returns false for expired key', async () => {
    await repository.markAsProcessed('key', 0);
    await new Promise((resolve) => setImmediate(resolve));
    expect(await repository.isProcessed('key')).toBe(false);
  });

  it('clearExpired purges only expired keys', async () => {
    await repository.markAsProcessed('permanent');
    await repository.markAsProcessed('expired', 0);
    await new Promise((resolve) => setImmediate(resolve));
    await repository.clearExpired();
    expect(await repository.isProcessed('permanent')).toBe(true);
    expect(await repository.isProcessed('expired')).toBe(false);
  });
});
