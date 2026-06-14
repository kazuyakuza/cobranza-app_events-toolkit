import { OutboxService } from './outbox.service';
import {
  createTestEnvelope,
  createOutboxMocks,
  createService,
  resetMocks,
  OutboxMocks,
} from './outbox.service.fixture';

describe('OutboxService', () => {
  let mocks: OutboxMocks;
  let service: OutboxService;

  beforeEach(() => {
    mocks = createOutboxMocks();
    service = createService(mocks);
    resetMocks(mocks);
  });

  describe('saveToOutbox', () => {
    it('calls repository.save with correct event and subject', async () => {
      const envelope = createTestEnvelope();
      const subject = 'company.550e8400e29b41d4a716446655440000.payment.proof.uploaded.v1';

      await service.saveToOutbox(envelope, subject);

      expect(mocks.repository.save).toHaveBeenCalledWith({ event: envelope, subject });
    });

    it('calls logger.logOutboxSaved with correct context', async () => {
      const envelope = createTestEnvelope();
      const subject = 'company.550e8400e29b41d4a716446655440000.payment.proof.uploaded.v1';

      await service.saveToOutbox(envelope, subject);

      expect(mocks.logger.logOutboxSaved).toHaveBeenCalledWith(
        expect.objectContaining({ eventId: envelope.id, subject }),
      );
    });
  });
});
