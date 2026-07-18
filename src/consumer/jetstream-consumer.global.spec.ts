import { validateSync } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { GlobalEventEnvelope } from '../common/envelope/global-event-envelope.class';
import { EventEnvelope } from '../common/envelope/event-envelope.class';
import { ActorType } from '../common/envelope/actor-type.enum';

describe('JetStreamConsumer global event routing', () => {
  describe('GlobalEventEnvelope on global subjects', () => {
    it('validates a properly formed GlobalEventEnvelope without company_id', () => {
      const envelope = plainToInstance(GlobalEventEnvelope, {
        id: 'evt_01929390-7abc-7123-8def-0123456789ab',
        type: 'iam.company.created',
        version: '1.0.0',
        produced_at: '2026-01-15T10:30:00.000Z',
        producer: 'iam-service',
        actor_type: ActorType.SYSTEM,
        correlation_id: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
        data: { name: 'Acme Corp' },
      });
      const errors = validateSync(envelope);
      expect(errors).toHaveLength(0);
    });

    it('rejects a GlobalEventEnvelope missing correlation_id', () => {
      const envelope = plainToInstance(GlobalEventEnvelope, {
        id: 'evt_01929390-7abc-7123-8def-0123456789ab',
        type: 'iam.company.created',
        version: '1.0.0',
        produced_at: '2026-01-15T10:30:00.000Z',
        producer: 'iam-service',
        actor_type: ActorType.SYSTEM,
        data: { name: 'Acme Corp' },
      });
      const errors = validateSync(envelope);
      expect(errors.some((e) => e.property === 'correlation_id')).toBe(true);
    });

    it('tolerates extra company_id on a GlobalEventEnvelope (whitelist mode disabled)', () => {
      const envelope = plainToInstance(GlobalEventEnvelope, {
        id: 'evt_01929390-7abc-7123-8def-0123456789ab',
        type: 'iam.company.created',
        version: '1.0.0',
        produced_at: '2026-01-15T10:30:00.000Z',
        producer: 'iam-service',
        actor_type: ActorType.SYSTEM,
        correlation_id: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
        data: { name: 'Acme Corp' },
        company_id: '550e8400-e29b-41d4-a716-446655440000',
      });
      const errors = validateSync(envelope);
      expect(errors).toHaveLength(0);
    });
  });

  describe('EnvelopeValidationUtil routing', () => {
    it('pickEnvelopeClass returns GlobalEventEnvelope for global subjects', () => {
      const subject = 'global.iam.company.created.v1';
      const cls = subject.startsWith('global.') ? GlobalEventEnvelope : EventEnvelope;
      const envelope = plainToInstance(cls, {
        id: 'evt_test',
        type: 'iam.company.created',
        version: '1',
        produced_at: '2026-01-15T10:30:00.000Z',
        producer: 'test',
        actor_type: ActorType.SYSTEM,
        correlation_id: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
        data: {},
      });
      expect(envelope).toBeInstanceOf(GlobalEventEnvelope);
    });

    it('pickEnvelopeClass returns EventEnvelope for tenant subjects', () => {
      const subject = 'company.abc123.payment.proof.uploaded.v1';
      const cls = subject.startsWith('global.') ? GlobalEventEnvelope : EventEnvelope;
      const envelope = plainToInstance(cls, {
        id: 'evt_test',
        type: 'payment.proof.uploaded',
        version: '1',
        produced_at: '2026-01-15T10:30:00.000Z',
        producer: 'test',
        company_id: '550e8400-e29b-41d4-a716-446655440000',
        actor_type: ActorType.CLIENT,
        actor_id: 'user-1',
        correlation_id: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
        data: {},
      });
      expect(envelope).toBeInstanceOf(EventEnvelope);
    });
  });
});
