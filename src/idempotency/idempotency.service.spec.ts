import { IdempotencyService } from './idempotency.service';
import { IdempotencyRepository } from './idempotency.types';
import { EventLoggerService } from '../logging/event-logger.service';
import { IDEMPOTENCY_SERVICE_DEPS_TOKEN } from './idempotency-service-deps.interface';
import { EventEnvelope } from '../common/envelope/event-envelope.class';
import { ActorType } from '../common/envelope/actor-type.enum';

function createTestEvent(id: string, correlationId: string): EventEnvelope<unknown> {
  return new EventEnvelope<unknown>({
    id,
    correlation_id: correlationId,
    type: 'test.event',
    version: '1.0.0',
    produced_at: new Date().toISOString(),
    producer: 'test-service',
    company_id: '00000000-0000-0000-0000-000000000001',
    actor_type: ActorType.SYSTEM,
    actor_id: 'actor-1',
    data: {},
  });
}

class MockIdempotencyRepository {
  isProcessed = jest.fn();
  markAsProcessed = jest.fn();
  clearExpired = jest.fn();
}

describe('IdempotencyService', () => {
  let service: IdempotencyService;
  let mockRepository: MockIdempotencyRepository;
  let mockLogger: { logEventConsumed: jest.Mock };

  function createService(deps?: { defaultTtlSeconds?: number }) {
    mockRepository = new MockIdempotencyRepository();
    mockLogger = { logEventConsumed: jest.fn() };
    service = new IdempotencyService({
      repository: mockRepository as unknown as IdempotencyRepository,
      logger: mockLogger as unknown as EventLoggerService,
      options: deps,
    });
    return service;
  }

  beforeEach(() => {
    createService();
  });

  describe('isDuplicate', () => {
    it('returns true when repository says key exists', async () => {
      mockRepository.isProcessed.mockResolvedValue(true);
      const event = createTestEvent('evt_001', 'corr_001');
      const result = await service.isDuplicate(event);
      expect(result).toBe(true);
      expect(mockRepository.isProcessed).toHaveBeenCalledWith('evt_001:corr_001');
    });

    it('returns false when repository says key does not exist', async () => {
      mockRepository.isProcessed.mockResolvedValue(false);
      const event = createTestEvent('evt_002', 'corr_002');
      const result = await service.isDuplicate(event);
      expect(result).toBe(false);
    });
  });

  describe('markAsProcessed', () => {
    it('marks key with explicit ttlSeconds', async () => {
      const event = createTestEvent('evt_003', 'corr_003');
      await service.markAsProcessed(event, 300);
      expect(mockRepository.markAsProcessed).toHaveBeenCalledWith('evt_003:corr_003', 300);
    });

    it('marks key with default ttlSeconds when calling without TTL', async () => {
      createService({ defaultTtlSeconds: 600 });
      const event = createTestEvent('evt_004', 'corr_004');
      await service.markAsProcessed(event);
      expect(mockRepository.markAsProcessed).toHaveBeenCalledWith('evt_004:corr_004', 600);
    });

    it('marks key with undefined TTL when no default and no explicit TTL', async () => {
      const event = createTestEvent('evt_005', 'corr_005');
      await service.markAsProcessed(event);
      expect(mockRepository.markAsProcessed).toHaveBeenCalledWith('evt_005:corr_005', undefined);
    });
  });

  describe('executeIfNotProcessed', () => {
    it('runs handler and marks as processed when not duplicate', async () => {
      mockRepository.isProcessed.mockResolvedValue(false);
      const handler = jest.fn().mockResolvedValue('result');
      const event = createTestEvent('evt_007', 'corr_007');
      const result = await service.executeIfNotProcessed({ event, handler });

      expect(result).toBe('result');
      expect(handler).toHaveBeenCalledTimes(1);
      expect(mockRepository.markAsProcessed).toHaveBeenCalledWith('evt_007:corr_007', undefined);
    });

    it('returns undefined and does NOT run handler when duplicate', async () => {
      mockRepository.isProcessed.mockResolvedValue(true);
      const handler = jest.fn();
      const event = createTestEvent('evt_008', 'corr_008');
      const result = await service.executeIfNotProcessed({ event, handler });

      expect(result).toBeUndefined();
      expect(handler).not.toHaveBeenCalled();
      expect(mockRepository.markAsProcessed).not.toHaveBeenCalled();
    });

    it('does NOT mark as processed when handler throws', async () => {
      mockRepository.isProcessed.mockResolvedValue(false);
      const handler = jest.fn().mockRejectedValue(new Error('handler error'));
      const event = createTestEvent('evt_009', 'corr_009');

      await expect(service.executeIfNotProcessed({ event, handler })).rejects.toThrow('handler error');
      expect(mockRepository.markAsProcessed).not.toHaveBeenCalled();
    });

    it('forwards explicit ttlSeconds to markAsProcessed', async () => {
      mockRepository.isProcessed.mockResolvedValue(false);
      const handler = jest.fn().mockResolvedValue('result');
      const event = createTestEvent('evt_010', 'corr_010');
      await service.executeIfNotProcessed({ event, handler, ttlSeconds: 120 });
      expect(mockRepository.markAsProcessed).toHaveBeenCalledWith('evt_010:corr_010', 120);
    });
  });
});
