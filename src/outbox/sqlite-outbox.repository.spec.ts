import { SqliteOutboxRepository } from './sqlite-outbox.repository';
import { ActorType } from '../common/envelope/actor-type.enum';
import { EventEnvelope } from '../common/envelope/event-envelope.class';

function createTestEnvelope(id: string): EventEnvelope<unknown> {
  return new EventEnvelope<unknown>({
    id,
    type: 'test.created',
    version: '1.0.0',
    produced_at: new Date().toISOString(),
    producer: 'test-service',
    company_id: '00000000-0000-0000-0000-000000000001',
    actor_type: ActorType.SYSTEM,
    actor_id: 'actor-1',
    correlation_id: '00000000-0000-0000-0000-000000000002',
    data: { value: 'test' },
  });
}

type MockStmt = { run: jest.Mock; all: jest.Mock };

const capturedRuns: Array<Record<string, unknown>> = [];
const capturedAlls: Array<{ limit: number }> = [];
const mockDb = {
  pragma: jest.fn(),
  exec: jest.fn(),
  prepare: jest.fn(() => {
    const stmt: MockStmt = {
      run: jest.fn((params: Record<string, unknown>) => {
        capturedRuns.push(params);
      }),
      all: jest.fn((limit: number) => {
        capturedAlls.push({ limit });
        return [];
      }),
    };
    return stmt;
  }),
};

jest.mock('better-sqlite3', () => {
  return jest.fn().mockImplementation(() => mockDb);
});

describe('SqliteOutboxRepository', () => {
  let repository: SqliteOutboxRepository;

  beforeEach(() => {
    capturedRuns.length = 0;
    capturedAlls.length = 0;
    jest.clearAllMocks();
    repository = new SqliteOutboxRepository(':memory:');
  });

  it('should create the outbox table on construction', () => {
    expect(mockDb.exec).toHaveBeenCalledWith(expect.stringContaining('CREATE TABLE IF NOT EXISTS outbox'));
  });

  it('should enable WAL journal mode', () => {
    expect(mockDb.pragma).toHaveBeenCalledWith('journal_mode = WAL');
  });

  describe('save()', () => {
    it('should call prepare with INSERT SQL and run with correct fields', async () => {
      const envelope = createTestEnvelope('evt_001');
      await repository.save({ event: envelope, subject: 'test.created' });

      expect(mockDb.prepare).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO outbox'));
      expect(capturedRuns.length).toBeGreaterThanOrEqual(1);
      expect(capturedRuns[capturedRuns.length - 1]).toEqual(
        expect.objectContaining({ id: 'evt_001', subject: 'test.created' }),
      );
    });

    it('should serialize event envelope as JSON in event_data', async () => {
      const envelope = createTestEnvelope('evt_002');
      await repository.save({ event: envelope, subject: 'test.created' });

      const callArgs = capturedRuns[capturedRuns.length - 1];
      const parsed = JSON.parse(callArgs.event_data as string);
      expect(parsed.id).toBe('evt_002');
      expect(parsed.type).toBe('test.created');
    });

    it('should store metadata as JSON when provided', async () => {
      const envelope = createTestEnvelope('evt_003');
      await repository.save({ event: envelope, subject: 'test.created', metadata: { traceId: 'abc' } });

      const callArgs = capturedRuns[capturedRuns.length - 1];
      expect(JSON.parse(callArgs.metadata as string)).toEqual({ traceId: 'abc' });
    });

    it('should store null metadata when not provided', async () => {
      const envelope = createTestEnvelope('evt_004');
      await repository.save({ event: envelope, subject: 'test.created' });

      const callArgs = capturedRuns[capturedRuns.length - 1];
      expect(callArgs.metadata).toBeNull();
    });
  });

  describe('getPending()', () => {
    it('should call prepare with SELECT SQL and all with limit', async () => {
      await repository.getPending(50);

      expect(mockDb.prepare).toHaveBeenCalledWith(expect.stringContaining('SELECT'));
      expect(capturedAlls.length).toBeGreaterThanOrEqual(1);
      expect(capturedAlls[capturedAlls.length - 1].limit).toBe(50);
    });

    it('should default limit to 100 when not specified', async () => {
      await repository.getPending();

      expect(capturedAlls[capturedAlls.length - 1].limit).toBe(100);
    });

    it('should map snake_case rows to camelCase OutboxEntry fields', async () => {
      const rawRow = {
        id: 'evt_map',
        event_data: '{"id":"evt_map"}',
        subject: 'test.mapping',
        metadata: '{"key":"val"}',
        status: 'pending',
        attempts: 0,
        last_error: null,
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
      };
      const selectStmt: MockStmt = { run: jest.fn(), all: jest.fn().mockReturnValue([rawRow]) };
      mockDb.prepare.mockReturnValueOnce(selectStmt);

      const result = await repository.getPending();

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('evt_map');
      expect(result[0].subject).toBe('test.mapping');
      expect(result[0].status).toBe('pending');
      expect(result[0].attempts).toBe(0);
      expect(result[0].lastError).toBeNull();
      expect(result[0].createdAt).toBe('2026-01-01T00:00:00.000Z');
    });
  });

  describe('markAsSent()', () => {
    it('should call prepare with UPDATE SQL and run with id', async () => {
      await repository.markAsSent('evt_020');

      expect(mockDb.prepare).toHaveBeenCalledWith(expect.stringContaining("status = 'sent'"));
      expect(capturedRuns[capturedRuns.length - 1]).toEqual(expect.objectContaining({ id: 'evt_020' }));
    });
  });

  describe('markAsFailed()', () => {
    it('should call prepare with UPDATE SQL and run with id and error', async () => {
      await repository.markAsFailed('evt_030', 'connection timeout');

      expect(mockDb.prepare).toHaveBeenCalledWith(expect.stringContaining("status = 'failed'"));
      expect(capturedRuns[capturedRuns.length - 1]).toEqual(
        expect.objectContaining({ id: 'evt_030', last_error: 'connection timeout' }),
      );
    });
  });
});
