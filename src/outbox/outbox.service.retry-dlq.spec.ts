import { EventEnvelope } from '../common/envelope/event-envelope.class';
import {
  createTestEnvelope,
  createTestEntry,
  createOutboxMocks,
  createService,
  resetMocks,
  OutboxMocks,
} from './outbox.service.fixture';
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

    it('preserves reply_to in the DLQ envelope when original event has reply_to', async () => {
      const envelopeWithReplyTo = Object.assign(createTestEnvelope(), {
        reply_to: 'company.550e8400...credit.check.requested.response.v1',
      });
      const entryWithReplyTo = createTestEntry({
        eventData: JSON.stringify(envelopeWithReplyTo),
        attempts: 3,
      });
      mocks.repository.getPending.mockResolvedValue([entryWithReplyTo]);
      mocks.producerService.publish.mockRejectedValueOnce(new Error('fail')).mockResolvedValueOnce(undefined);

      jest.useFakeTimers();
      service.startProcessor();
      await jest.advanceTimersByTimeAsync(5000);

      const dlqCall = mocks.producerService.publish.mock.calls[1];
      const dlqEnvelope = dlqCall[1] as EventEnvelope<unknown>;
      expect(dlqEnvelope.reply_to).toBe('company.550e8400...credit.check.requested.response.v1');
      jest.useRealTimers();
    });
  });
});
