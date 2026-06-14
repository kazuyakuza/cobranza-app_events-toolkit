import { validateSync } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { EventBase } from './event-base.class';
import { EventEnvelope } from './event-envelope.class';
import { ActorType } from './actor-type.enum';

interface PaymentProofData {
  amount: number;
  currency: string;
}

class TestPaymentEvent extends EventBase<PaymentProofData> {
  readonly type = 'payment.proof.uploaded';
  readonly version = '1.0.0';
}

describe('EventBase', () => {
  describe('extends EventEnvelope', () => {
    it('concrete subclass is instance of EventEnvelope', () => {
      const event = new TestPaymentEvent();
      expect(event).toBeInstanceOf(EventEnvelope);
    });

    it('concrete subclass is instance of EventBase', () => {
      const event = new TestPaymentEvent();
      expect(event).toBeInstanceOf(EventBase);
    });
  });

  describe('abstract type/version enforcement', () => {
    it('concrete subclass defines type property', () => {
      const event = new TestPaymentEvent();
      expect(event.type).toBe('payment.proof.uploaded');
    });

    it('concrete subclass defines version property', () => {
      const event = new TestPaymentEvent();
      expect(event.version).toBe('1.0.0');
    });
  });

  describe('constructor inheritance', () => {
    it('passes properties to constructor populates EventBase fields', () => {
      const event = new TestPaymentEvent({
        id: 'evt_01929390-7abc-7123-8def-0123456789ab',
        produced_at: '2026-01-15T10:30:00.000Z',
        producer: 'payment-service',
        company_id: '550e8400-e29b-41d4-a716-446655440000',
        actor_type: ActorType.SYSTEM,
        actor_id: 'user-123',
        correlation_id: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
        data: { amount: 100, currency: 'ARS' },
      });
      expect(event.id).toBe('evt_01929390-7abc-7123-8def-0123456789ab');
      expect(event.company_id).toBe('550e8400-e29b-41d4-a716-446655440000');
    });

    it('EventEnvelope fields are accessible on subclass', () => {
      const event = new TestPaymentEvent({
        id: 'evt_test-id',
        producer: 'test-service',
      });
      expect(event.id).toBe('evt_test-id');
      expect(event.producer).toBe('test-service');
    });
  });

  describe('generic data type', () => {
    it('preserves data type through class hierarchy', () => {
      const data: PaymentProofData = { amount: 1500, currency: 'ARS' };
      const event = new TestPaymentEvent({ data });
      expect(event.data).toEqual(data);
      expect(event.data.amount).toBe(1500);
      expect(event.data.currency).toBe('ARS');
    });
  });

  describe('validation inheritance', () => {
    it('class-validator decorators from EventEnvelope work on EventBase subclass', () => {
      const event = plainToInstance(TestPaymentEvent, {
        id: 'evt_01929390-7abc-7123-8def-0123456789ab',
        type: 'payment.proof.uploaded',
        version: '1.0.0',
        produced_at: '2026-01-15T10:30:00.000Z',
        producer: 'payment-service',
        company_id: '550e8400-e29b-41d4-a716-446655440000',
        actor_type: ActorType.SYSTEM,
        actor_id: 'user-123',
        correlation_id: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
        data: { amount: 100 },
      });
      const errors = validateSync(event);
      expect(errors).toHaveLength(0);
    });

    it('invalid fields on EventBase subclass produce validation errors', () => {
      const event = plainToInstance(TestPaymentEvent, {
        id: 'invalid-id',
        type: 'payment.proof.uploaded',
        version: '1.0.0',
        produced_at: 'not-a-date',
        producer: 'payment-service',
        company_id: 'not-a-uuid',
        actor_type: ActorType.CLIENT,
        actor_id: 'user-1',
        correlation_id: 'not-a-uuid',
        data: { amount: 100 },
      });
      const errors = validateSync(event);
      const invalidProps = errors.map((e) => e.property);
      expect(invalidProps).toContain('id');
      expect(invalidProps).toContain('produced_at');
      expect(invalidProps).toContain('company_id');
      expect(invalidProps).toContain('correlation_id');
    });
  });
});
