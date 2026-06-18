import { ActorType } from '../common/envelope/actor-type.enum';
import { EventEnvelope } from '../common/envelope/event-envelope.class';
import { EventContext } from '../common/envelope/event-context.interface';
import { MockProducerService } from './mock-producer.service';

function createTestContext(): EventContext {
  return {
    type: 'payment.proof.uploaded',
    version: '1.0.0',
    producer: 'test-service',
    companyId: '550e8400-e29b-41d4-a716-446655440000',
    actorType: ActorType.SYSTEM,
    actorId: 'test-actor',
    correlationId: '660e8400-e29b-41d4-a716-446655440001',
  };
}

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

describe('MockProducerService', () => {
  let service: MockProducerService;

  beforeEach(() => {
    service = new MockProducerService();
  });

  it('getPublishedEvents returns empty array initially', () => {
    expect(service.getPublishedEvents()).toEqual([]);
  });

  it('publish records event with correct subject and envelope', async () => {
    const envelope = createTestEnvelope();
    await service.publish('company.test.payment.proof.uploaded.v1', envelope);

    const events = service.getPublishedEvents();
    expect(events).toHaveLength(1);
    expect(events[0].subject).toBe('company.test.payment.proof.uploaded.v1');
    expect(events[0].event).toBe(envelope);
  });

  it('emit builds envelope from EmitOptions and records it', async () => {
    await service.emit({
      subject: 'company.test.payment.proof.uploaded.v1',
      data: { amount: 250 },
      context: createTestContext(),
    });

    const events = service.getPublishedEvents();
    expect(events).toHaveLength(1);
    expect(events[0].subject).toBe('company.test.payment.proof.uploaded.v1');
    expect(events[0].event.type).toBe('payment.proof.uploaded');
    expect(events[0].event.data).toEqual({ amount: 250 });
  });

  it('getLastEvent returns the most recent event', async () => {
    const first = createTestEnvelope();
    const second = createTestEnvelope();
    await service.publish('subject.1', first);
    await service.publish('subject.2', second);

    const last = service.getLastEvent();
    expect(last?.subject).toBe('subject.2');
  });

  it('getPublishedSubjects returns all subjects in order', async () => {
    await service.publish('subject.a', createTestEnvelope());
    await service.publish('subject.b', createTestEnvelope());

    expect(service.getPublishedSubjects()).toEqual(['subject.a', 'subject.b']);
  });

  it('count returns published event count', async () => {
    expect(service.count).toBe(0);
    await service.publish('subject.a', createTestEnvelope());
    expect(service.count).toBe(1);
    await service.publish('subject.b', createTestEnvelope());
    expect(service.count).toBe(2);
  });

  it('clear removes all recorded events', async () => {
    await service.publish('subject.a', createTestEnvelope());
    service.clear();
    expect(service.count).toBe(0);
    expect(service.getPublishedEvents()).toEqual([]);
  });

  describe('getPublishedEventsBySubject', () => {
    it('returns events matching the subject', async () => {
      await service.publish('platform.service.register.v1', createTestEnvelope());
      await service.publish('platform.service.heartbeat.v1', createTestEnvelope());
      await service.publish('platform.service.register.v1', createTestEnvelope());

      const result = service.getPublishedEventsBySubject('platform.service.register.v1');
      expect(result.length).toBe(2);
    });

    it('returns empty array when no events match', () => {
      const result = service.getPublishedEventsBySubject('nonexistent.subject');
      expect(result).toEqual([]);
    });
  });
});
