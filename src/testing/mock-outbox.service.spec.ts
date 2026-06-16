import { ActorType } from '../common/envelope/actor-type.enum';
import { EventEnvelope } from '../common/envelope/event-envelope.class';
import { MockOutboxService } from './mock-outbox.service';

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

  it('startProcessor and stopProcessor are no-ops', () => {
    expect(() => {
      service.startProcessor();
      service.stopProcessor();
    }).not.toThrow();
  });
});
