import { MockIdempotencyService } from './mock-idempotency.service';
import { EventEnvelope } from '../common/envelope/event-envelope.class';

function buildTestEvent(id: string, correlationId: string): EventEnvelope {
  return new EventEnvelope({ id, type: 'test.event', correlation_id: correlationId });
}

describe('MockIdempotencyService', () => {
  let service: MockIdempotencyService;

  beforeEach(() => {
    service = new MockIdempotencyService();
  });

  describe('isDuplicate', () => {
    it('returns false for a new event', async () => {
      const event = buildTestEvent('evt_1', 'corr_1');
      await expect(service.isDuplicate(event)).resolves.toBe(false);
    });

    it('returns true after markAsProcessed', async () => {
      const event = buildTestEvent('evt_1', 'corr_1');
      await service.markAsProcessed(event);
      await expect(service.isDuplicate(event)).resolves.toBe(true);
    });

    it('keys by event.id:correlation_id composite', async () => {
      const eventA = buildTestEvent('evt_1', 'corr_1');
      const eventB = buildTestEvent('evt_1', 'corr_2');
      const eventC = buildTestEvent('evt_2', 'corr_1');

      await service.markAsProcessed(eventA);
      await expect(service.isDuplicate(eventA)).resolves.toBe(true);
      await expect(service.isDuplicate(eventB)).resolves.toBe(false);
      await expect(service.isDuplicate(eventC)).resolves.toBe(false);
    });
  });

  describe('markAsProcessed', () => {
    it('increments count after marking', async () => {
      expect(service.count).toBe(0);
      await service.markAsProcessed(buildTestEvent('evt_1', 'corr_1'));
      expect(service.count).toBe(1);
    });

    it('overwrites on re-mark (no error)', async () => {
      const event = buildTestEvent('evt_1', 'corr_1');
      await service.markAsProcessed(event);
      await service.markAsProcessed(event);
      expect(service.count).toBe(1);
    });
  });

  describe('executeIfNotProcessed', () => {
    it('executes handler and marks when not duplicate', async () => {
      const event = buildTestEvent('evt_1', 'corr_1');
      const result = await service.executeIfNotProcessed({
        event,
        handler: async () => 'done',
      });
      expect(result).toBe('done');
      await expect(service.isDuplicate(event)).resolves.toBe(true);
    });

    it('returns undefined and skips handler when duplicate', async () => {
      const event = buildTestEvent('evt_1', 'corr_1');
      await service.markAsProcessed(event);

      const handler = jest.fn().mockResolvedValue('should-not-run');
      const result = await service.executeIfNotProcessed({ event, handler });
      expect(result).toBeUndefined();
      expect(handler).not.toHaveBeenCalled();
    });

    it('does not mark when handler throws', async () => {
      const event = buildTestEvent('evt_1', 'corr_1');
      const handler = jest.fn().mockRejectedValue(new Error('fail'));
      await expect(service.executeIfNotProcessed({ event, handler })).rejects.toThrow('fail');
      await expect(service.isDuplicate(event)).resolves.toBe(false);
    });
  });

  describe('clear', () => {
    it('resets all tracked keys', async () => {
      await service.markAsProcessed(buildTestEvent('evt_1', 'corr_1'));
      expect(service.count).toBe(1);
      service.clear();
      expect(service.count).toBe(0);
    });
  });

  describe('processedKeys', () => {
    it('returns the set of processed keys', async () => {
      await service.markAsProcessed(buildTestEvent('evt_1', 'corr_1'));
      await service.markAsProcessed(buildTestEvent('evt_2', 'corr_2'));
      const keys = service.processedKeys;
      expect(keys.size).toBe(2);
      expect(keys.has('evt_1:corr_1')).toBe(true);
      expect(keys.has('evt_2:corr_2')).toBe(true);
    });
  });
});
