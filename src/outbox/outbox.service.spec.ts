import { OutboxService } from './outbox.service';
import { EventEnvelope } from '../common/envelope/event-envelope.class';
import { ActorType } from '../common/envelope/actor-type.enum';
import { OutboxEntry, OutboxRepository } from './outbox.types';

function createTestEnvelope(): EventEnvelope<unknown> {
  return new EventEnvelope<unknown>({
    id: 'evt_01929390-7abc-7123-8def-0123456789ab',
    type: 'payment.proof.uploaded',
    version: '1.0.0',
    produced_at: '2026-01-15T10:30:00.000Z',
    producer: 'payment-service',
    company_id: '550e8400-e29b-41d4-a716-446655440000',
    actor_type: ActorType.SYSTEM,
    actor_id: 'user-123',
    correlation_id: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
    data: { amount: 100 },
  });
}

function createTestEntry(overrides?: Partial<OutboxEntry>): OutboxEntry {
  return {
    id: 'evt_01929390-7abc-7123-8def-0123456789ab',
    eventData: JSON.stringify(createTestEnvelope()),
    subject: 'company.550e8400e29b41d4a716446655440000.payment.proof.uploaded.v1',
    metadata: null,
    status: 'pending',
    attempts: 0,
    lastError: null,
    createdAt: '2026-01-15T10:30:00.000Z',
    updatedAt: '2026-01-15T10:30:00.000Z',
    ...overrides,
  };
}

const mockRepository: jest.Mocked<OutboxRepository> = {
  save: jest.fn(),
  getPending: jest.fn(),
  markAsSent: jest.fn(),
  markAsFailed: jest.fn(),
};

const mockProducerService = {
  publish: jest.fn(),
};

const mockLogger = {
  logOutboxSaved: jest.fn(),
  logOutboxProcessed: jest.fn(),
  logOutboxFailed: jest.fn(),
  logOutboxDlq: jest.fn(),
  logEventError: jest.fn(),
};

function createService(options?: Record<string, unknown>): OutboxService {
  return new OutboxService({
    repository: mockRepository,
    producerService: mockProducerService as never,
    logger: mockLogger as never,
    options: options as never,
  });
}

describe('OutboxService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRepository.save.mockResolvedValue(undefined);
    mockRepository.getPending.mockResolvedValue([]);
    mockRepository.markAsSent.mockResolvedValue(undefined);
    mockRepository.markAsFailed.mockResolvedValue(undefined);
  });

  describe('saveToOutbox', () => {
    it('calls repository.save with correct event and subject', async () => {
      const service = createService();
      const envelope = createTestEnvelope();
      const subject = 'company.550e8400e29b41d4a716446655440000.payment.proof.uploaded.v1';

      await service.saveToOutbox(envelope, subject);

      expect(mockRepository.save).toHaveBeenCalledWith({ event: envelope, subject });
    });

    it('calls logger.logOutboxSaved with correct context', async () => {
      const service = createService();
      const envelope = createTestEnvelope();
      const subject = 'company.550e8400e29b41d4a716446655440000.payment.proof.uploaded.v1';

      await service.saveToOutbox(envelope, subject);

      expect(mockLogger.logOutboxSaved).toHaveBeenCalledWith(
        expect.objectContaining({ eventId: envelope.id, subject }),
      );
    });
  });

  describe('startProcessor / stopProcessor', () => {
    it('starts processing on interval tick when enabled', async () => {
      const entry = createTestEntry();
      mockRepository.getPending.mockResolvedValue([entry]);
      mockProducerService.publish.mockResolvedValue(undefined);

      const service = createService();
      jest.useFakeTimers();
      service.startProcessor();
      await jest.advanceTimersByTimeAsync(5000);

      expect(mockRepository.getPending).toHaveBeenCalled();
      jest.useRealTimers();
    });

    it('does not start a second interval when already started', async () => {
      mockRepository.getPending.mockResolvedValue([]);

      const service = createService();
      jest.useFakeTimers();
      service.startProcessor();
      service.startProcessor();
      await jest.advanceTimersByTimeAsync(5000);

      expect(mockRepository.getPending).toHaveBeenCalledTimes(1);
      jest.useRealTimers();
    });

    it('does not start when disabled', async () => {
      const service = createService({ enabled: false });
      jest.useFakeTimers();
      service.startProcessor();
      await jest.advanceTimersByTimeAsync(5000);

      expect(mockRepository.getPending).not.toHaveBeenCalled();
      jest.useRealTimers();
    });

    it('stops processing after stopProcessor is called', async () => {
      mockRepository.getPending.mockResolvedValue([]);

      const service = createService();
      jest.useFakeTimers();
      service.startProcessor();
      await jest.advanceTimersByTimeAsync(5000);
      expect(mockRepository.getPending).toHaveBeenCalledTimes(1);

      service.stopProcessor();
      await jest.advanceTimersByTimeAsync(5000);
      expect(mockRepository.getPending).toHaveBeenCalledTimes(1);
      jest.useRealTimers();
    });

    it('stopProcessor does nothing when not started', () => {
      const service = createService();
      expect(() => service.stopProcessor()).not.toThrow();
    });
  });

  describe('onModuleDestroy', () => {
    it('calls stopProcessor on module destroy', () => {
      const service = createService();
      const stopSpy = jest.spyOn(service, 'stopProcessor');
      service.onModuleDestroy();
      expect(stopSpy).toHaveBeenCalled();
    });
  });

  describe('processing — success path', () => {
    it('polls repository and publishes each entry', async () => {
      const entry = createTestEntry();
      mockRepository.getPending.mockResolvedValue([entry]);
      mockProducerService.publish.mockResolvedValue(undefined);

      const service = createService();
      jest.useFakeTimers();
      service.startProcessor();
      await jest.advanceTimersByTimeAsync(5000);

      expect(mockProducerService.publish).toHaveBeenCalledWith(
        entry.subject,
        expect.objectContaining({ id: entry.id }),
      );
      jest.useRealTimers();
    });

    it('marks entry as sent after successful publish', async () => {
      const entry = createTestEntry();
      mockRepository.getPending.mockResolvedValue([entry]);
      mockProducerService.publish.mockResolvedValue(undefined);

      const service = createService();
      jest.useFakeTimers();
      service.startProcessor();
      await jest.advanceTimersByTimeAsync(5000);

      expect(mockRepository.markAsSent).toHaveBeenCalledWith(entry.id);
      jest.useRealTimers();
    });

    it('logs success with correct context', async () => {
      const entry = createTestEntry();
      mockRepository.getPending.mockResolvedValue([entry]);
      mockProducerService.publish.mockResolvedValue(undefined);

      const service = createService();
      jest.useFakeTimers();
      service.startProcessor();
      await jest.advanceTimersByTimeAsync(5000);

      expect(mockLogger.logOutboxProcessed).toHaveBeenCalledWith(expect.objectContaining({ eventId: entry.id }));
      jest.useRealTimers();
    });
  });

  describe('processing — retry path', () => {
    it('increments attempt count via markAsFailed on publish failure', async () => {
      const entry = createTestEntry({ attempts: 0 });
      mockRepository.getPending.mockResolvedValue([entry]);
      mockProducerService.publish.mockRejectedValue(new Error('NATS error'));

      const service = createService();
      jest.useFakeTimers();
      service.startProcessor();
      await jest.advanceTimersByTimeAsync(5000);

      expect(mockRepository.markAsFailed).toHaveBeenCalledWith(entry.id, 'NATS error');
      jest.useRealTimers();
    });

    it('logs failure before retrying', async () => {
      const entry = createTestEntry({ attempts: 0 });
      mockRepository.getPending.mockResolvedValue([entry]);
      mockProducerService.publish.mockRejectedValue(new Error('NATS error'));

      const service = createService();
      jest.useFakeTimers();
      service.startProcessor();
      await jest.advanceTimersByTimeAsync(5000);

      expect(mockLogger.logOutboxFailed).toHaveBeenCalled();
      jest.useRealTimers();
    });
  });

  describe('processing — DLQ routing', () => {
    it('routes to DLQ when attempts exceed maxRetries', async () => {
      const entry = createTestEntry({ attempts: 3 });
      mockRepository.getPending.mockResolvedValue([entry]);
      mockProducerService.publish.mockRejectedValueOnce(new Error('fail')).mockResolvedValueOnce(undefined);

      const service = createService();
      jest.useFakeTimers();
      service.startProcessor();
      await jest.advanceTimersByTimeAsync(5000);

      expect(mockProducerService.publish).toHaveBeenCalledWith(
        expect.stringContaining('dlq.'),
        expect.any(EventEnvelope),
      );
      jest.useRealTimers();
    });

    it('marks entry as sent after DLQ routing', async () => {
      const entry = createTestEntry({ attempts: 3 });
      mockRepository.getPending.mockResolvedValue([entry]);
      mockProducerService.publish.mockRejectedValueOnce(new Error('fail')).mockResolvedValueOnce(undefined);

      const service = createService();
      jest.useFakeTimers();
      service.startProcessor();
      await jest.advanceTimersByTimeAsync(5000);

      expect(mockRepository.markAsSent).toHaveBeenCalledWith(entry.id);
      jest.useRealTimers();
    });

    it('logs DLQ routing', async () => {
      const entry = createTestEntry({ attempts: 3 });
      mockRepository.getPending.mockResolvedValue([entry]);
      mockProducerService.publish.mockRejectedValueOnce(new Error('fail')).mockResolvedValueOnce(undefined);

      const service = createService();
      jest.useFakeTimers();
      service.startProcessor();
      await jest.advanceTimersByTimeAsync(5000);

      expect(mockLogger.logOutboxDlq).toHaveBeenCalled();
      jest.useRealTimers();
    });
  });
});
