import { ActorType } from '../common/envelope/actor-type.enum';
import { EventEnvelope } from '../common/envelope/event-envelope.class';
import { EventConsumerException } from '../common/errors/event-consumer.exception';
import { MockConsumerService } from './mock-consumer.service';

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

describe('MockConsumerService', () => {
  let service: MockConsumerService;

  beforeEach(() => {
    service = new MockConsumerService();
  });

  it('registerHandler adds handler and handlerCount reflects it', () => {
    const handler = jest.fn();
    service.registerHandler('company.*.payment.proof.uploaded.v1', handler);

    expect(service.handlerCount).toBe(1);
    expect(service.getHandler('company.*.payment.proof.uploaded.v1')).toBe(handler);
  });

  it('dispatch invokes registered handler with event and context', async () => {
    const handler = jest.fn();
    const envelope = createTestEnvelope();
    service.registerHandler('company.*.payment.proof.uploaded.v1', handler);

    await service.dispatch({
      subject: 'company.*.payment.proof.uploaded.v1',
      event: envelope,
      context: {
        type: envelope.type,
        version: envelope.version,
        producer: envelope.producer,
        companyId: envelope.company_id,
        actorType: envelope.actor_type,
        actorId: envelope.actor_id,
        correlationId: envelope.correlation_id,
      },
    });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(
      envelope,
      expect.objectContaining({
        type: 'payment.proof.uploaded',
        companyId: '550e8400-e29b-41d4-a716-446655440000',
      }),
    );
  });

  it('dispatch throws EventConsumerException for unregistered subject', async () => {
    const envelope = createTestEnvelope();

    await expect(
      service.dispatch({
        subject: 'company.nonexistent.v1',
        event: envelope,
        context: {
          type: envelope.type,
          version: envelope.version,
          producer: envelope.producer,
          companyId: envelope.company_id,
          actorType: envelope.actor_type,
          actorId: envelope.actor_id,
          correlationId: envelope.correlation_id,
        },
      }),
    ).rejects.toThrow(EventConsumerException);
  });

  it('simulateEvent creates context from envelope and dispatches', async () => {
    const handler = jest.fn();
    const envelope = createTestEnvelope();
    service.registerHandler('company.*.payment.proof.uploaded.v1', handler);

    await service.simulateEvent('company.*.payment.proof.uploaded.v1', envelope);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(
      envelope,
      expect.objectContaining({
        correlationId: '660e8400-e29b-41d4-a716-446655440001',
      }),
    );
  });

  it('clear removes all registered handlers', () => {
    service.registerHandler('subject.a', jest.fn());
    service.registerHandler('subject.b', jest.fn());
    expect(service.handlerCount).toBe(2);

    service.clear();
    expect(service.handlerCount).toBe(0);
  });

  it('getHandler returns undefined for unregistered subject', () => {
    expect(service.getHandler('company.nonexistent.v1')).toBeUndefined();
  });
});
