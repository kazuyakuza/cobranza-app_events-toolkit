import { EventEnvelope } from '../common/envelope/event-envelope.class';
import { createTestEntry, createOutboxMocks, createService, resetMocks, OutboxMocks } from './outbox.service.fixture';
import { OutboxService } from './outbox.service';

describe('OutboxService', () => {
  let mocks: OutboxMocks;
  let service: OutboxService;

  beforeEach(() => {
    mocks = createOutboxMocks();
    service = createService(mocks);
    resetMocks(mocks);
  });

  describe('processing — retry path', () => {
    it('increments attempt count via markAsFailed on publish failure', async () => {
      const entry = createTestEntry({ attempts: 0 });
      mocks.repository.getPending.mockResolvedValue([entry]);
      mocks.producerService.publish.mockRejectedValue(new Error('NATS error'));

      jest.useFakeTimers();
      service.startProcessor();
      await jest.advanceTimersByTimeAsync(5000);

      expect(mocks.repository.markAsFailed).toHaveBeenCalledWith(entry.id, 'NATS error');
      jest.useRealTimers();
    });

    it('logs failure before retrying', async () => {
      const entry = createTestEntry({ attempts: 0 });
      mocks.repository.getPending.mockResolvedValue([entry]);
      mocks.producerService.publish.mockRejectedValue(new Error('NATS error'));

      jest.useFakeTimers();
      service.startProcessor();
      await jest.advanceTimersByTimeAsync(5000);

      expect(mocks.logger.logOutboxFailed).toHaveBeenCalled();
      jest.useRealTimers();
    });
  });

  describe('processing — DLQ routing', () => {
    it('routes to DLQ when attempts exceed maxRetries', async () => {
      const entry = createTestEntry({ attempts: 3 });
      mocks.repository.getPending.mockResolvedValue([entry]);
      mocks.producerService.publish.mockRejectedValueOnce(new Error('fail')).mockResolvedValueOnce(undefined);

      jest.useFakeTimers();
      service.startProcessor();
      await jest.advanceTimersByTimeAsync(5000);

      expect(mocks.producerService.publish).toHaveBeenCalledWith(
        expect.stringContaining('dlq.'),
        expect.any(EventEnvelope),
      );
      jest.useRealTimers();
    });

    it('marks entry as sent after DLQ routing', async () => {
      const entry = createTestEntry({ attempts: 3 });
      mocks.repository.getPending.mockResolvedValue([entry]);
      mocks.producerService.publish.mockRejectedValueOnce(new Error('fail')).mockResolvedValueOnce(undefined);

      jest.useFakeTimers();
      service.startProcessor();
      await jest.advanceTimersByTimeAsync(5000);

      expect(mocks.repository.markAsSent).toHaveBeenCalledWith(entry.id);
      jest.useRealTimers();
    });

    it('logs DLQ routing', async () => {
      const entry = createTestEntry({ attempts: 3 });
      mocks.repository.getPending.mockResolvedValue([entry]);
      mocks.producerService.publish.mockRejectedValueOnce(new Error('fail')).mockResolvedValueOnce(undefined);

      jest.useFakeTimers();
      service.startProcessor();
      await jest.advanceTimersByTimeAsync(5000);

      expect(mocks.logger.logOutboxDlq).toHaveBeenCalled();
      jest.useRealTimers();
    });
  });
});
