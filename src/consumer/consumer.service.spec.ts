import { Test } from '@nestjs/testing';
import { ConsumerService } from './consumer.service';
import { EventEnvelope } from '../common/envelope/event-envelope.class';
import { ActorType } from '../common/envelope/actor-type.enum';
import { EventContext } from '../producer/producer.service';
import { EventConsumerException } from '../common/errors/event-consumer.exception';

describe('ConsumerService', () => {
  let service: ConsumerService;

  const sampleContext: EventContext = {
    type: 'payment.proof.uploaded',
    version: '1.0.0',
    producer: 'payment-service',
    companyId: '550e8400-e29b-41d4-a716-446655440000',
    actorType: ActorType.CLIENT,
    actorId: 'user-123',
    correlationId: '660e8400-e29b-41d4-a716-446655440001',
  };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [ConsumerService],
    }).compile();

    service = module.get(ConsumerService);
  });

  describe('registerHandler', () => {
    it('should register a handler for a subject', () => {
      const handler = jest.fn();
      service.registerHandler('company.*.payment.proof.uploaded.v1', handler);
      expect(service.handlerCount).toBe(1);
    });

    it('should replace an existing handler for the same subject', () => {
      const firstHandler = jest.fn();
      const secondHandler = jest.fn();
      service.registerHandler('company.*.payment.proof.uploaded.v1', firstHandler);
      service.registerHandler('company.*.payment.proof.uploaded.v1', secondHandler);
      expect(service.handlerCount).toBe(1);
      expect(service.getHandler('company.*.payment.proof.uploaded.v1')).toBe(secondHandler);
    });
  });

  describe('dispatch', () => {
    it('should invoke the registered handler with event and context', async () => {
      const handler = jest.fn().mockResolvedValue(undefined);
      service.registerHandler('company.*.payment.proof.uploaded.v1', handler);

      const event = createTestEvent();
      await service.dispatch({ subject: 'company.*.payment.proof.uploaded.v1', event, context: sampleContext });

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(event, sampleContext);
    });

    it('should throw EventConsumerException when no handler is registered', async () => {
      const event = createTestEvent();
      await expect(service.dispatch({ subject: 'unknown.subject', event, context: sampleContext })).rejects.toThrow(
        EventConsumerException,
      );
      await expect(service.dispatch({ subject: 'unknown.subject', event, context: sampleContext })).rejects.toThrow(
        'No handler registered for subject: unknown.subject',
      );
    });

    it('should propagate handler errors', async () => {
      const handlerError = new Error('Handler failed');
      const handler = jest.fn().mockRejectedValue(handlerError);
      service.registerHandler('company.*.payment.proof.uploaded.v1', handler);

      const event = createTestEvent();
      await expect(
        service.dispatch({ subject: 'company.*.payment.proof.uploaded.v1', event, context: sampleContext }),
      ).rejects.toThrow('Handler failed');
    });
  });

  describe('getHandler', () => {
    it('should return undefined for unregistered subject', () => {
      expect(service.getHandler('unknown.subject')).toBeUndefined();
    });

    it('should return the registered handler', () => {
      const handler = jest.fn();
      service.registerHandler('company.*.payment.proof.uploaded.v1', handler);
      expect(service.getHandler('company.*.payment.proof.uploaded.v1')).toBe(handler);
    });
  });

  describe('handlerCount', () => {
    it('should return 0 initially', () => {
      expect(service.handlerCount).toBe(0);
    });

    it('should reflect the number of registered handlers', () => {
      service.registerHandler('subject.a', jest.fn());
      service.registerHandler('subject.b', jest.fn());
      expect(service.handlerCount).toBe(2);
    });
  });
});

function createTestEvent(overrides: Partial<EventEnvelope<unknown>> = {}): EventEnvelope<unknown> {
  return new EventEnvelope({
    id: 'evt_test-123',
    type: 'payment.proof.uploaded',
    version: '1.0.0',
    produced_at: '2026-06-13T15:00:00.000Z',
    producer: 'payment-service',
    company_id: '550e8400-e29b-41d4-a716-446655440000',
    actor_type: ActorType.CLIENT,
    actor_id: 'user-123',
    correlation_id: '660e8400-e29b-41d4-a716-446655440001',
    data: { amount: 100 },
    ...overrides,
  });
}
