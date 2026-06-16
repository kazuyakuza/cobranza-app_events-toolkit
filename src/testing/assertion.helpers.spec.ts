import { ActorType } from '../common/envelope/actor-type.enum';
import { EventEnvelope } from '../common/envelope/event-envelope.class';
import { MockProducerService } from './mock-producer.service';
import {
  expectEventPublished,
  expectNoEventsPublished,
  expectEventWithMatch,
  expectEnvelope,
} from './assertion.helpers';

function createTestEnvelope(type?: string): EventEnvelope<unknown> {
  return new EventEnvelope({
    id: 'evt_test-id-001',
    type: type ?? 'payment.proof.uploaded',
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

describe('assertion helpers', () => {
  let producer: MockProducerService;

  beforeEach(() => {
    producer = new MockProducerService();
  });

  describe('expectEventPublished', () => {
    it('passes when matching subject exists', async () => {
      await producer.publish('company.test.event.v1', createTestEnvelope());

      expect(() => {
        expectEventPublished(producer, 'company.test.event.v1');
      }).not.toThrow();
    });

    it('fails when no matching subject', async () => {
      await producer.publish('company.other.event.v1', createTestEnvelope());

      expect(() => {
        expectEventPublished(producer, 'company.test.event.v1');
      }).toThrow();
    });
  });

  describe('expectNoEventsPublished', () => {
    it('passes on empty producer', () => {
      expect(() => {
        expectNoEventsPublished(producer);
      }).not.toThrow();
    });

    it('fails on non-empty producer', async () => {
      await producer.publish('company.test.event.v1', createTestEnvelope());

      expect(() => {
        expectNoEventsPublished(producer);
      }).toThrow();
    });
  });

  describe('expectEventWithMatch', () => {
    it('filters by eventType', async () => {
      await producer.publish('subject.a', createTestEnvelope('type.a'));
      await producer.publish('subject.b', createTestEnvelope('type.b'));

      expect(() => {
        expectEventWithMatch(producer, { eventType: 'type.a' });
      }).not.toThrow();

      expect(() => {
        expectEventWithMatch(producer, { eventType: 'type.c' });
      }).toThrow();
    });

    it('filters by companyId', async () => {
      const envelopeA = createTestEnvelope();
      await producer.publish('subject.a', envelopeA);

      expect(() => {
        expectEventWithMatch(producer, { companyId: '550e8400-e29b-41d4-a716-446655440000' });
      }).not.toThrow();

      expect(() => {
        expectEventWithMatch(producer, { companyId: 'does-not-exist' });
      }).toThrow();
    });
  });

  describe('expectEnvelope', () => {
    it('checks type, version, producer, company_id', () => {
      const envelope = createTestEnvelope();

      expect(() => {
        expectEnvelope(envelope, {
          type: 'payment.proof.uploaded',
          version: '1.0.0',
          producer: 'test-service',
          company_id: '550e8400-e29b-41d4-a716-446655440000',
        });
      }).not.toThrow();
    });

    it('only checks specified fields', () => {
      const envelope = createTestEnvelope();

      expect(() => {
        expectEnvelope(envelope, { type: 'payment.proof.uploaded' });
      }).not.toThrow();
    });

    it('fails when field does not match', () => {
      const envelope = createTestEnvelope();

      expect(() => {
        expectEnvelope(envelope, { type: 'wrong.type' });
      }).toThrow();
    });
  });
});
