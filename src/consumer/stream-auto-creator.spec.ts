import { NatsConnection, RetentionPolicy, StorageType } from 'nats';
import { StreamAutoCreator } from './stream-auto-creator';

function createMockConnection(): {
  connection: NatsConnection;
  jetStreamManagerMock: { streams: { find: jest.Mock; add: jest.Mock } };
} {
  const streams = { find: jest.fn(), add: jest.fn() };
  const jetStreamManager = { streams };
  const connection = { jetstreamManager: jest.fn().mockResolvedValue(jetStreamManager) } as unknown as NatsConnection;
  return { connection, jetStreamManagerMock: streams };
}

describe('StreamAutoCreator', () => {
  describe('buildStreamName', () => {
    it('should sanitize wildcard subject with dots and asterisks', () => {
      const { connection } = createMockConnection();
      const creator = new StreamAutoCreator({ connection });
      expect(creator.buildStreamName('company.*.response.v1')).toBe('auto-company---response-v1');
    });

    it('should preserve digits and lowercase the result', () => {
      const { connection } = createMockConnection();
      const creator = new StreamAutoCreator({ connection });
      expect(creator.buildStreamName('EVENT.v2')).toBe('auto-event-v2');
    });

    it('should replace multiple special characters with hyphens', () => {
      const { connection } = createMockConnection();
      const creator = new StreamAutoCreator({ connection });
      expect(creator.buildStreamName('test.subject.123')).toBe('auto-test-subject-123');
    });
  });

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
      expect(jetStreamManagerMock.add).toHaveBeenCalledWith({
        name: 'auto-test-subject',
        subjects: ['test.subject'],
        retention: RetentionPolicy.Limits,
        storage: StorageType.File,
        max_msgs: -1,
        max_bytes: -1,
        max_age: 0,
      });
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
});
