import { ActorType } from '../common/envelope/actor-type.enum';
import { EventEnvelope } from '../common/envelope/event-envelope.class';
import { MockOutboxService } from './mock-outbox.service';
import { SendAsyncRequestThroughOutboxOptions } from '../outbox/send-async-request-through-outbox-options.interface';

function createTestEnvelope(): EventEnvelope<unknown> {
  return new EventEnvelope({
    id: 'evt_test-id-001',
    type: 'payment.proof.uploaded',
    version: '1.0.0',
    produced_at: '2026-06-16T12:00:00.000Z',
    producer: 'test-service',
    company_id: '550e8400-e29b-41d4-a716-446655440000',
    actor_type: ActorType.SYSTEM,
    actor_id: 'test-actor',
    correlation_id: '660e8400-e29b-41d4-a716-446655440001',
    data: { amount: 250 },
  });
}

describe('MockOutboxService', () => {
  let service: MockOutboxService;

  beforeEach(() => {
    service = new MockOutboxService();
  });

  it('saveToOutbox records event with correct subject', async () => {
    const envelope = createTestEnvelope();
    await service.saveToOutbox(envelope, 'company.test.payment.proof.uploaded.v1');

    const saved = service.getSavedEvents();
    expect(saved).toHaveLength(1);
    expect(saved[0].subject).toBe('company.test.payment.proof.uploaded.v1');
    expect(saved[0].event).toBe(envelope);
  });

  it('sendRequestThroughOutbox records event', async () => {
    const envelope = createTestEnvelope();
    await service.sendRequestThroughOutbox(envelope, 'company.test.request.v1');

    const saved = service.getSavedEvents();
    expect(saved).toHaveLength(1);
    expect(saved[0].subject).toBe('company.test.request.v1');
  });

  it('getSavedEvents returns all saved events', async () => {
    const env1 = createTestEnvelope();
    const env2 = createTestEnvelope();
    await service.saveToOutbox(env1, 'subject.a');
    await service.saveToOutbox(env2, 'subject.b');

    expect(service.getSavedEvents()).toHaveLength(2);
  });

  it('count returns saved event count', async () => {
    expect(service.count).toBe(0);
    await service.saveToOutbox(createTestEnvelope(), 'subject.a');
    expect(service.count).toBe(1);
  });

  it('clear removes all recorded events', async () => {
    await service.saveToOutbox(createTestEnvelope(), 'subject.a');
    service.clear();
    expect(service.count).toBe(0);
    expect(service.getSavedEvents()).toEqual([]);
  });

  it('saveInTransaction records event ignoring transaction context', async () => {
    const envelope = createTestEnvelope();
    await service.saveInTransaction({
      event: envelope,
      subject: 'company.test.tx.payment.v1',
      transactionContext: { type: 'typeorm-query-runner' },
    });

    const saved = service.getSavedEvents();
    expect(saved).toHaveLength(1);
    expect(saved[0].subject).toBe('company.test.tx.payment.v1');
    expect(saved[0].event).toBe(envelope);
  });

  it('sendAsyncRequestThroughOutbox builds envelope and returns correlationId', async () => {
    const options: SendAsyncRequestThroughOutboxOptions<{ clientId: string }> = {
      subject: 'company.test.credit.check.requested.v1',
      payload: { clientId: 'clt-001' },
      context: {
        type: 'credit.check.requested',
        version: '1.0.0',
        producer: 'test-service',
        companyId: '550e8400-e29b-41d4-a716-446655440000',
        actorType: ActorType.SYSTEM,
        actorId: 'test-actor',
        correlationId: 'corr-001',
        replyTo: 'company.test.credit.check.completed.v1',
      },
    };

    const result = await service.sendAsyncRequestThroughOutbox(options);

    expect(result.correlationId).toBe('corr-001');
    const saved = service.getSavedEvents();
    expect(saved).toHaveLength(1);
    expect(saved[0].subject).toBe('company.test.credit.check.requested.v1');
    expect(saved[0].event.correlation_id).toBe('corr-001');
    expect(saved[0].event.reply_to).toBe('company.test.credit.check.completed.v1');
  });

  it('startProcessor and stopProcessor are no-ops', () => {
    expect(() => {
      service.startProcessor();
      service.stopProcessor();
    }).not.toThrow();
  });
});
