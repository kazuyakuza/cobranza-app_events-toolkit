import { OutboxService } from './outbox.service';
import { createTestEnvelope, createOutboxMocks, createService, resetMocks } from './outbox.service.fixture';
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
