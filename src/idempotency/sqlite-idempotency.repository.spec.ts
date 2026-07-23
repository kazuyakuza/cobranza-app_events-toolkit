import { SqliteIdempotencyRepository } from './sqlite-idempotency.repository';

type MockStmt = { get: jest.Mock; run: jest.Mock };
const capturedGets: Array<unknown[]> = [];
const capturedRuns: Array<unknown[]> = [];

const mockDb = {
  pragma: jest.fn(),
  exec: jest.fn(),
  prepare: jest.fn(() => {
    const stmt: MockStmt = {
      get: jest.fn((...args: unknown[]) => {
        capturedGets.push(args);
        return undefined;
      }),
      run: jest.fn((...args: unknown[]) => {
        capturedRuns.push(args);
      }),
    };
    return stmt;
  }),
};

jest.mock('better-sqlite3', () => {
  return jest.fn().mockImplementation(() => mockDb);
});

describe('SqliteIdempotencyRepository', () => {
  let repository: SqliteIdempotencyRepository;

  beforeEach(() => {
    capturedGets.length = 0;
    capturedRuns.length = 0;
    jest.clearAllMocks();
    repository = new SqliteIdempotencyRepository(':memory:');
  });

  it('creates idempotency_keys table on construction', () => {
    expect(mockDb.exec).toHaveBeenCalledWith(expect.stringContaining('CREATE TABLE IF NOT EXISTS idempotency_keys'));
  });

  it('enables WAL journal mode', () => {
    expect(mockDb.pragma).toHaveBeenCalledWith('journal_mode = WAL');
  });

  describe('isProcessed', () => {
    it('returns false when key does not exist', async () => {
      const result = await repository.isProcessed('missing-key');
      expect(result).toBe(false);
    });

    it('runs SELECT with key and nowIso', async () => {
      await repository.isProcessed('some-key');
      expect(mockDb.prepare).toHaveBeenCalledWith(expect.stringContaining('SELECT 1 FROM idempotency_keys'));
      expect(capturedGets.length).toBe(1);
      expect(capturedGets[0][0]).toBe('some-key');
      expect(capturedGets[0][1]).toEqual(expect.any(String));
    });

    it('returns true when row is found', async () => {
      const getStmt: MockStmt = { get: jest.fn().mockReturnValue({}), run: jest.fn() };
      mockDb.prepare.mockReturnValueOnce(getStmt);
      const result = await repository.isProcessed('existing-key');
      expect(result).toBe(true);
    });
  });

  describe('markAsProcessed', () => {
    it('inserts key with created_at and null expires_at when no TTL', async () => {
      await repository.markAsProcessed('key-no-ttl');
      expect(mockDb.prepare).toHaveBeenCalledWith(expect.stringContaining('INSERT OR IGNORE'));
      expect(capturedRuns[capturedRuns.length - 1][0]).toBe('key-no-ttl');
      expect(capturedRuns[capturedRuns.length - 1][1]).toEqual(expect.any(String));
      expect(capturedRuns[capturedRuns.length - 1][2]).toBeNull();
    });

    it('inserts key with expires_at when TTL is provided', async () => {
      await repository.markAsProcessed('key-with-ttl', 3600);
      const runArgs = capturedRuns[capturedRuns.length - 1];
      expect(runArgs[0]).toBe('key-with-ttl');
      expect(runArgs[2]).toEqual(expect.any(String));
    });
  });

  describe('clearExpired', () => {
    it('deletes rows where expires_at < now', async () => {
      await repository.clearExpired();
      expect(mockDb.prepare).toHaveBeenCalledWith(expect.stringContaining('DELETE FROM idempotency_keys'));
    });
  });
});
