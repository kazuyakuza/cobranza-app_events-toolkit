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

  describe('startProcessor / stopProcessor', () => {
    it('starts processing on interval tick when enabled', async () => {
      const entry = createTestEntry();
      mocks.repository.getPending.mockResolvedValue([entry]);
      mocks.producerService.publish.mockResolvedValue(undefined);

      jest.useFakeTimers();
      service.startProcessor();
      await jest.advanceTimersByTimeAsync(5000);

      expect(mocks.repository.getPending).toHaveBeenCalled();
      jest.useRealTimers();
    });

    it('does not start a second interval when already started', async () => {
      mocks.repository.getPending.mockResolvedValue([]);

      jest.useFakeTimers();
      service.startProcessor();
      service.startProcessor();
      await jest.advanceTimersByTimeAsync(5000);

      expect(mocks.repository.getPending).toHaveBeenCalledTimes(1);
      jest.useRealTimers();
    });

    it('does not start when disabled', async () => {
      service = createService(mocks, { enabled: false });

      jest.useFakeTimers();
      service.startProcessor();
      await jest.advanceTimersByTimeAsync(5000);

      expect(mocks.repository.getPending).not.toHaveBeenCalled();
      jest.useRealTimers();
    });

    it('stops processing after stopProcessor is called', async () => {
      mocks.repository.getPending.mockResolvedValue([]);

      jest.useFakeTimers();
      service.startProcessor();
      await jest.advanceTimersByTimeAsync(5000);
      expect(mocks.repository.getPending).toHaveBeenCalledTimes(1);

      service.stopProcessor();
      await jest.advanceTimersByTimeAsync(5000);
      expect(mocks.repository.getPending).toHaveBeenCalledTimes(1);
      jest.useRealTimers();
    });

    it('stopProcessor does nothing when not started', () => {
      expect(() => service.stopProcessor()).not.toThrow();
    });
  });

  describe('onModuleDestroy', () => {
    it('calls stopProcessor on module destroy', () => {
      const stopSpy = jest.spyOn(service, 'stopProcessor');
      service.onModuleDestroy();
      expect(stopSpy).toHaveBeenCalled();
    });
  });

  describe('processing — success path', () => {
    it('polls repository and publishes each entry', async () => {
      const entry = createTestEntry();
      mocks.repository.getPending.mockResolvedValue([entry]);
      mocks.producerService.publish.mockResolvedValue(undefined);

      jest.useFakeTimers();
      service.startProcessor();
      await jest.advanceTimersByTimeAsync(5000);

      expect(mocks.producerService.publish).toHaveBeenCalledWith(
        entry.subject,
        expect.objectContaining({ id: entry.id }),
      );
      jest.useRealTimers();
    });

    it('marks entry as sent after successful publish', async () => {
      const entry = createTestEntry();
      mocks.repository.getPending.mockResolvedValue([entry]);
      mocks.producerService.publish.mockResolvedValue(undefined);

      jest.useFakeTimers();
      service.startProcessor();
      await jest.advanceTimersByTimeAsync(5000);

      expect(mocks.repository.markAsSent).toHaveBeenCalledWith(entry.id);
      jest.useRealTimers();
    });

    it('logs success with correct context', async () => {
      const entry = createTestEntry();
      mocks.repository.getPending.mockResolvedValue([entry]);
      mocks.producerService.publish.mockResolvedValue(undefined);

      jest.useFakeTimers();
      service.startProcessor();
      await jest.advanceTimersByTimeAsync(5000);

      expect(mocks.logger.logOutboxProcessed).toHaveBeenCalledWith(expect.objectContaining({ eventId: entry.id }));
      jest.useRealTimers();
    });
  });
});
