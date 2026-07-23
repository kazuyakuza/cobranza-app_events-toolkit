import { MemoryIdempotencyRepository } from './memory-idempotency.repository';

describe('MemoryIdempotencyRepository', () => {
  let repository: MemoryIdempotencyRepository;

  beforeEach(() => {
    jest.useFakeTimers();
    repository = new MemoryIdempotencyRepository();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('isProcessed returns false for unknown key', async () => {
    const result = await repository.isProcessed('unknown-key');
    expect(result).toBe(false);
  });

  it('isProcessed returns true after markAsProcessed', async () => {
    await repository.markAsProcessed('key-1');
    expect(await repository.isProcessed('key-1')).toBe(true);
  });

  it('isProcessed returns false for expired key', async () => {
    await repository.markAsProcessed('key-2', 0);
    jest.advanceTimersByTime(2000);
    expect(await repository.isProcessed('key-2')).toBe(false);
  });

  it('markAsProcessed overwrites existing key', async () => {
    await repository.markAsProcessed('key-3');
    await repository.markAsProcessed('key-3');
    expect(await repository.isProcessed('key-3')).toBe(true);
  });

  it('clearExpired removes only expired entries', async () => {
    await repository.markAsProcessed('permanent-key');
    await repository.markAsProcessed('expired-key', 0);
    jest.advanceTimersByTime(2000);
    await repository.clearExpired();
    expect(await repository.isProcessed('permanent-key')).toBe(true);
    expect(await repository.isProcessed('expired-key')).toBe(false);
  });
});
