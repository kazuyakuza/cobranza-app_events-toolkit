import { NatsConnection, RetentionPolicy, StorageType } from 'nats';
import { StreamAutoCreator } from './stream-auto-creator';
import { buildStreamName } from './build-stream-name.util';

function createMockLogger(): {
  logInfo: jest.Mock;
  logError: jest.Mock;
} {
  return { logInfo: jest.fn(), logError: jest.fn() };
}

function createMockConnection(): {
  connection: NatsConnection;
  jetStreamManagerMock: { find: jest.Mock; add: jest.Mock };
} {
  const jetStreamManagerMock = { find: jest.fn(), add: jest.fn() };
  const jetStreamManager = { streams: jetStreamManagerMock };
  const connection = { jetstreamManager: jest.fn().mockResolvedValue(jetStreamManager) } as unknown as NatsConnection;
  return { connection, jetStreamManagerMock };
}

describe('buildStreamName', () => {
  it('should sanitize wildcard subject with dots and asterisks collapsing consecutive separators', () => {
    expect(buildStreamName('company.*.response.v1')).toBe('company-response-v1');
  });

  it('should preserve digits and lowercase the result', () => {
    expect(buildStreamName('EVENT.v2')).toBe('event-v2');
  });

  it('should replace multiple special characters with a single hyphen', () => {
    expect(buildStreamName('test.subject.123')).toBe('test-subject-123');
  });
});

describe('StreamAutoCreator', () => {
  describe('ensureStreamExists', () => {
    it('should not create a stream when one already covers the subject', async () => {
      const { connection, jetStreamManagerMock } = createMockConnection();
      jetStreamManagerMock.find.mockResolvedValue({ name: 'existing-stream' });
      const creator = new StreamAutoCreator({ connection });

      await creator.ensureStreamExists('test.subject');

      expect(jetStreamManagerMock.find).toHaveBeenCalledWith('test.subject');
      expect(jetStreamManagerMock.add).not.toHaveBeenCalled();
    });

    it('should create a stream when find throws no stream matches subject', async () => {
      const { connection, jetStreamManagerMock } = createMockConnection();
      jetStreamManagerMock.find.mockRejectedValue(new Error('no stream matches subject'));
      jetStreamManagerMock.add.mockResolvedValue({});
      const creator = new StreamAutoCreator({ connection });

      await creator.ensureStreamExists('test.subject');

      expect(jetStreamManagerMock.find).toHaveBeenCalledWith('test.subject');
      expect(jetStreamManagerMock.add).toHaveBeenCalledTimes(1);
      expect(jetStreamManagerMock.add).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'test-subject',
          subjects: ['test.subject'],
          retention: RetentionPolicy.Limits,
          storage: StorageType.File,
        }),
      );
    });

    it('should swallow race condition when add throws stream name already in use', async () => {
      const { connection, jetStreamManagerMock } = createMockConnection();
      jetStreamManagerMock.find.mockRejectedValue(new Error('no stream matches subject'));
      jetStreamManagerMock.add.mockRejectedValue(new Error('stream name already in use'));
      const creator = new StreamAutoCreator({ connection });

      await expect(creator.ensureStreamExists('test.subject')).resolves.toBeUndefined();
    });

    it('should rethrow unknown errors from add', async () => {
      const { connection, jetStreamManagerMock } = createMockConnection();
      jetStreamManagerMock.find.mockRejectedValue(new Error('no stream matches subject'));
      jetStreamManagerMock.add.mockRejectedValue(new Error('unknown error'));
      const creator = new StreamAutoCreator({ connection });

      await expect(creator.ensureStreamExists('test.subject')).rejects.toThrow('unknown error');
    });

    it('should rethrow unknown errors from find', async () => {
      const { connection, jetStreamManagerMock } = createMockConnection();
      jetStreamManagerMock.find.mockRejectedValue(new Error('permission denied'));
      const creator = new StreamAutoCreator({ connection });

      await expect(creator.ensureStreamExists('test.subject')).rejects.toThrow('permission denied');
    });
  });

  describe('with streamConfig overrides', () => {
    it('should merge overrides over defaults (user max_bytes wins)', async () => {
      const { connection, jetStreamManagerMock } = createMockConnection();
      jetStreamManagerMock.find.mockRejectedValue(new Error('no stream matches subject'));
      jetStreamManagerMock.add.mockResolvedValue({});
      const creator = new StreamAutoCreator({
        connection: connection,
        streamConfig: { max_bytes: 100_000 },
      });

      await creator.ensureStreamExists('test.subject');

      const sent = jetStreamManagerMock.add.mock.calls[0][0] as { max_bytes: number };
      expect(sent.max_bytes).toBe(100_000);
      expect(sent.name).toBe('test-subject');
      expect(sent.subjects).toEqual(['test.subject']);
      expect(sent.retention).toBe(RetentionPolicy.Limits);
    });

    it('should INFO-log overrides when logger is provided and overrides exist', async () => {
      const { connection, jetStreamManagerMock } = createMockConnection();
      const logger = createMockLogger();
      jetStreamManagerMock.find.mockRejectedValue(new Error('no stream matches subject'));
      jetStreamManagerMock.add.mockResolvedValue({});
      const creator = new StreamAutoCreator({
        connection,
        streamConfig: { max_bytes: 100_000 },
        logger,
      });

      await creator.ensureStreamExists('test.subject');

      expect(logger.logInfo).toHaveBeenCalledTimes(1);
      const [message, meta] = logger.logInfo.mock.calls[0];
      expect(message).toBe('Stream auto-creation with custom config overrides');
      expect((meta as { subject: string }).subject).toBe('test.subject');
      expect((meta as { config: { max_bytes: number } }).config.max_bytes).toBe(100_000);
    });

    it('should not INFO-log when no streamConfig is provided', async () => {
      const { connection, jetStreamManagerMock } = createMockConnection();
      const logger = createMockLogger();
      jetStreamManagerMock.find.mockRejectedValue(new Error('no stream matches subject'));
      jetStreamManagerMock.add.mockResolvedValue({});
      const creator = new StreamAutoCreator({ connection, logger });

      await creator.ensureStreamExists('test.subject');

      expect(logger.logInfo).not.toHaveBeenCalled();
    });

    it('should ERROR-log server rejection and rethrow unknown errors', async () => {
      const { connection, jetStreamManagerMock } = createMockConnection();
      const logger = createMockLogger();
      jetStreamManagerMock.find.mockRejectedValue(new Error('no stream matches subject'));
      jetStreamManagerMock.add.mockRejectedValue(new Error('account requires a stream config to have max bytes set'));
      const creator = new StreamAutoCreator({ connection, logger });

      await expect(creator.ensureStreamExists('test.subject')).rejects.toThrow(
        'account requires a stream config to have max bytes set',
      );
      expect(logger.logError).toHaveBeenCalledTimes(1);
      const [message, meta] = logger.logError.mock.calls[0];
      expect(message).toBe('NATS server rejected stream config');
      expect((meta as { subject: string }).subject).toBe('test.subject');
      expect((meta as { error: string }).error).toContain('max bytes set');
    });

    it('should not ERROR-log race-condition errors (stream name in use)', async () => {
      const { connection, jetStreamManagerMock } = createMockConnection();
      const logger = createMockLogger();
      jetStreamManagerMock.find.mockRejectedValue(new Error('no stream matches subject'));
      jetStreamManagerMock.add.mockRejectedValue(new Error('stream name already in use'));
      const creator = new StreamAutoCreator({ connection, logger });

      await expect(creator.ensureStreamExists('test.subject')).resolves.toBeUndefined();
      expect(logger.logError).not.toHaveBeenCalled();
    });
  });
});
