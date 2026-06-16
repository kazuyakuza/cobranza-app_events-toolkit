import { OutboxService } from './outbox.service';
import { createTestEnvelope, createOutboxMocks, createService, OutboxMocks } from './outbox.service.fixture';
import { TypeormQueryRunnerContext } from './transaction-context.interface';

describe('OutboxService - saveInTransaction', () => {
  let mocks: OutboxMocks;
  let service: OutboxService;

  beforeEach(() => {
    mocks = createOutboxMocks();
    service = createService(mocks);
  });

  it('calls repository.save with event, subject, and transaction context', async () => {
    const envelope = createTestEnvelope();
    const subject = 'company.550e8400e29b41d4a716446655440000.payment.proof.uploaded.v1';
    const transactionContext: TypeormQueryRunnerContext = {
      type: 'typeorm-query-runner',
      queryRunner: { query: jest.fn().mockResolvedValue(undefined) },
    };

    await service.saveInTransaction({ event: envelope, subject, transactionContext });

    expect(mocks.repository.save).toHaveBeenCalledWith({
      event: envelope,
      subject,
      transactionContext,
    });
  });

  it('calls logger.logOutboxSaved with correct context', async () => {
    const envelope = createTestEnvelope();
    const subject = 'company.550e8400e29b41d4a716446655440000.payment.proof.uploaded.v1';
    const transactionContext: TypeormQueryRunnerContext = {
      type: 'typeorm-query-runner',
      queryRunner: { query: jest.fn().mockResolvedValue(undefined) },
    };

    await service.saveInTransaction({ event: envelope, subject, transactionContext });

    expect(mocks.logger.logOutboxSaved).toHaveBeenCalledWith(
      expect.objectContaining({ eventId: envelope.id, subject }),
    );
  });

  it('passes transactionContext object reference to repository.save', async () => {
    const envelope = createTestEnvelope();
    const subject = 'test.subject';
    const transactionContext: TypeormQueryRunnerContext = {
      type: 'typeorm-query-runner',
      queryRunner: { query: jest.fn().mockResolvedValue(undefined) },
    };

    await service.saveInTransaction({ event: envelope, subject, transactionContext });

    const saveCall = mocks.repository.save.mock.calls[0][0];
    expect(saveCall.transactionContext).toBe(transactionContext);
  });
});
