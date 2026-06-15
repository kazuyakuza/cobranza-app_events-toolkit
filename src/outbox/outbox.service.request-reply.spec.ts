import { OutboxService } from './outbox.service';
import {
  createTestEnvelope,
  createTestEntry,
  createOutboxMocks,
  createService,
  resetMocks,
} from './outbox.service.fixture';
import { OutboxRequestReplyException } from './outbox-request-reply.exception';

describe('OutboxService — sendRequestThroughOutbox', () => {
  let mocks: ReturnType<typeof createOutboxMocks>;
  let service: OutboxService;

  beforeEach(() => {
    mocks = createOutboxMocks();
    service = createService(mocks);
    resetMocks(mocks);
  });

  it('saves event to outbox when reply_to is present', async () => {
    const envelope = createTestEnvelope();
    envelope.reply_to = 'company.550e8400...credit.check.requested.response.v1';
    const subject = 'company.550e8400e29b41d4a716446655440000.credit.check.requested.v1';

    await service.sendRequestThroughOutbox(envelope, subject);

    expect(mocks.repository.save).toHaveBeenCalledWith({ event: envelope, subject });
  });

  it('throws OutboxRequestReplyException when reply_to is missing', async () => {
    const envelope = createTestEnvelope();

    await expect(service.sendRequestThroughOutbox(envelope, 'some.subject')).rejects.toThrow(
      OutboxRequestReplyException,
    );
  });

  it('throws with correct event metadata in exception', async () => {
    const envelope = createTestEnvelope();

    try {
      await service.sendRequestThroughOutbox(envelope, 'some.subject');
      fail('Expected OutboxRequestReplyException');
    } catch (error) {
      expect(error).toBeInstanceOf(OutboxRequestReplyException);
      const ex = error as OutboxRequestReplyException;
      expect(ex.eventId).toBe(envelope.id);
      expect(ex.eventType).toBe(envelope.type);
    }
  });

  it('logs outbox saved with correct context', async () => {
    const envelope = createTestEnvelope();
    envelope.reply_to = 'company.550e8400...credit.check.requested.response.v1';
    const subject = 'company.550e8400e29b41d4a716446655440000.credit.check.requested.v1';

    await service.sendRequestThroughOutbox(envelope, subject);

    expect(mocks.logger.logOutboxSaved).toHaveBeenCalledWith(
      expect.objectContaining({ eventId: envelope.id, subject }),
    );
  });
});

describe('OutboxService — request-reply processor flow', () => {
  let mocks: ReturnType<typeof createOutboxMocks>;
  let service: OutboxService;

  beforeEach(() => {
    mocks = createOutboxMocks();
    service = createService(mocks);
    resetMocks(mocks);
  });

  it('publishes request-reply event with reply_to intact from processor', async () => {
    const envelope = createTestEnvelope();
    envelope.reply_to = 'company.550e8400...credit.check.completed.v1';

    const entry = createTestEntry({
      eventData: JSON.stringify(envelope),
    });
    mocks.repository.getPending.mockResolvedValue([entry]);
    mocks.producerService.publish.mockResolvedValue(undefined);

    jest.useFakeTimers();
    service.startProcessor();
    await jest.advanceTimersByTimeAsync(5000);

    expect(mocks.producerService.publish).toHaveBeenCalledTimes(1);
    const [, publishedEnvelope] = mocks.producerService.publish.mock.calls[0];
    expect(publishedEnvelope.reply_to).toBe('company.550e8400...credit.check.completed.v1');
    jest.useRealTimers();
  });

  it('preserves reply_to through serialization round-trip', async () => {
    const originalReplyTo = 'company.550e8400...credit.check.completed.v1';
    const envelope = createTestEnvelope();
    envelope.reply_to = originalReplyTo;

    const entry = createTestEntry({
      eventData: JSON.stringify(envelope),
    });

    const parsed = JSON.parse(entry.eventData);
    expect(parsed.reply_to).toBe(originalReplyTo);

    mocks.repository.getPending.mockResolvedValue([entry]);
    mocks.producerService.publish.mockResolvedValue(undefined);

    jest.useFakeTimers();
    service.startProcessor();
    await jest.advanceTimersByTimeAsync(5000);

    const [, publishedEnvelope] = mocks.producerService.publish.mock.calls[0];
    expect(publishedEnvelope.reply_to).toBe(originalReplyTo);
    jest.useRealTimers();
  });

  it('sendRequestThroughOutbox followed by processor publish with reply_to intact', async () => {
    const envelope = createTestEnvelope();
    envelope.reply_to = 'company.550e8400...credit.check.completed.v1';
    const subject = 'company.550e8400e29b41d4a716446655440000.credit.check.requested.v1';

    await service.sendRequestThroughOutbox(envelope, subject);

    expect(mocks.repository.save).toHaveBeenCalledWith({ event: envelope, subject });

    const savedEntry = createTestEntry({
      id: envelope.id,
      eventData: JSON.stringify(envelope),
      subject,
    });
    mocks.repository.getPending.mockResolvedValue([savedEntry]);
    mocks.producerService.publish.mockResolvedValue(undefined);

    jest.useFakeTimers();
    service.startProcessor();
    await jest.advanceTimersByTimeAsync(5000);

    expect(mocks.producerService.publish).toHaveBeenCalledWith(
      subject,
      expect.objectContaining({
        reply_to: 'company.550e8400...credit.check.completed.v1',
      }),
    );
    jest.useRealTimers();
  });
});
