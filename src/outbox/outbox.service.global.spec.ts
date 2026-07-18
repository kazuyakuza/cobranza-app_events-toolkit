import { GlobalEventEnvelope } from '../common/envelope/global-event-envelope.class';
import { EventEnvelope } from '../common/envelope/event-envelope.class';
import { GlobalEventContext } from '../common/envelope/global-event-context.interface';
import { ActorType } from '../common/envelope/actor-type.enum';
import { createGlobalEvent, createEvent } from '../common/utils/event.factory';

describe('OutboxService — global events', () => {
  describe('createGlobalEvent through outbox', () => {
    it('creates a GlobalEventEnvelope without company_id', () => {
      const context: GlobalEventContext = {
        type: 'iam.company.created',
        version: '1.0.0',
        producer: 'iam-service',
        actorType: ActorType.SYSTEM,
        correlationId: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
      };
      const envelope = createGlobalEvent({ name: 'Acme Corp' }, context);
      expect(envelope).toBeInstanceOf(GlobalEventEnvelope);
      expect('company_id' in envelope).toBe(false);
      expect(envelope.correlation_id).toBe('7c9e6679-7425-40de-944b-e07fc1f90ae7');
    });

    it('createEvent still produces a tenant envelope with company_id', () => {
      const context = {
        type: 'payment.received',
        version: '1.0.0',
        producer: 'payment-service',
        companyId: '550e8400-e29b-41d4-a716-446655440000',
        actorType: ActorType.CLIENT,
        actorId: 'user-123',
        correlationId: '660e8400-e29b-41d4-a716-446655440001',
      };
      const envelope = createEvent({ amount: 100 }, context);
      expect(envelope).toBeInstanceOf(EventEnvelope);
      expect(envelope.company_id).toBe('550e8400-e29b-41d4-a716-446655440000');
    });
  });

  describe('DLQ envelope preservation', () => {
    it('createDlqEnvelope from a GlobalEventEnvelope returns a GlobalEventEnvelope', () => {
      const original = new GlobalEventEnvelope({
        id: 'evt_test',
        type: 'iam.company.created',
        version: '1',
        produced_at: '2026-01-15T10:30:00.000Z',
        producer: 'iam-service',
        actor_type: ActorType.SYSTEM,
        correlation_id: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
        data: { name: 'Acme Corp' },
      });

      const { createDlqEnvelope } = require('./outbox.utils');
      const dlqEnvelope = createDlqEnvelope(original, { error: 'test' });

      expect(dlqEnvelope).toBeInstanceOf(GlobalEventEnvelope);
      expect('company_id' in dlqEnvelope).toBe(false);
      expect(dlqEnvelope.id).toBe(original.id);
      expect(dlqEnvelope.data.error).toBe('test');
    });

    it('createDlqEnvelope from an EventEnvelope returns an EventEnvelope', () => {
      const original = new EventEnvelope({
        id: 'evt_test',
        type: 'payment.proof.uploaded',
        version: '1',
        produced_at: '2026-01-15T10:30:00.000Z',
        producer: 'payment-service',
        company_id: '550e8400-e29b-41d4-a716-446655440000',
        actor_type: ActorType.CLIENT,
        actor_id: 'user-123',
        correlation_id: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
        data: { amount: 100 },
      });

      const { createDlqEnvelope } = require('./outbox.utils');
      const dlqEnvelope = createDlqEnvelope(original, { error: 'test' });

      expect(dlqEnvelope).toBeInstanceOf(EventEnvelope);
      expect((dlqEnvelope as EventEnvelope).company_id).toBe('550e8400-e29b-41d4-a716-446655440000');
    });
  });
});
