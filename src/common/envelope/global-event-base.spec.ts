import { validateSync } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { GlobalEventBase } from './global-event-base.class';
import { GlobalEventEnvelope } from './global-event-envelope.class';
import { BaseEventEnvelope } from './base-event-envelope.class';
import { EventEnvelope } from './event-envelope.class';
import { ActorType } from './actor-type.enum';

interface CompanyCreatedData {
  name: string;
  tenantSlug: string;
}

class TestCompanyCreatedEvent extends GlobalEventBase<CompanyCreatedData> {
  readonly type = 'iam.company.created';
  readonly version = '1.0.0';
}

describe('GlobalEventBase', () => {
  describe('extends GlobalEventEnvelope', () => {
    it('concrete subclass is instance of GlobalEventEnvelope', () => {
      const event = new TestCompanyCreatedEvent();
      expect(event).toBeInstanceOf(GlobalEventEnvelope);
    });

    it('concrete subclass is instance of BaseEventEnvelope', () => {
      const event = new TestCompanyCreatedEvent();
      expect(event).toBeInstanceOf(BaseEventEnvelope);
    });

    it('concrete subclass is NOT instance of EventEnvelope', () => {
      const event = new TestCompanyCreatedEvent();
      expect(event).not.toBeInstanceOf(EventEnvelope);
    });
  });

  describe('abstract type/version enforcement', () => {
    it('concrete subclass defines type property', () => {
      const event = new TestCompanyCreatedEvent();
      expect(event.type).toBe('iam.company.created');
    });

    it('concrete subclass defines version property', () => {
      const event = new TestCompanyCreatedEvent();
      expect(event.version).toBe('1.0.0');
    });
  });

  describe('constructor inheritance', () => {
    it('passes properties to constructor populates GlobalEventBase fields', () => {
      const event = new TestCompanyCreatedEvent({
        id: 'evt_01929390-7abc-7123-8def-0123456789ab',
        produced_at: '2026-01-15T10:30:00.000Z',
        producer: 'iam-service',
        actor_type: ActorType.SYSTEM,
        correlation_id: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
        data: { name: 'Acme Corp', tenantSlug: 'acme' },
      });
      expect(event.id).toBe('evt_01929390-7abc-7123-8def-0123456789ab');
      expect(event.producer).toBe('iam-service');
      expect(event.data.name).toBe('Acme Corp');
    });
  });

  describe('validation inheritance', () => {
    it('class-validator decorators work on GlobalEventBase subclass', () => {
      const event = plainToInstance(TestCompanyCreatedEvent, {
        id: 'evt_01929390-7abc-7123-8def-0123456789ab',
        type: 'iam.company.created',
        version: '1.0.0',
        produced_at: '2026-01-15T10:30:00.000Z',
        producer: 'iam-service',
        actor_type: ActorType.SYSTEM,
        correlation_id: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
        data: { name: 'Acme Corp', tenantSlug: 'acme' },
      });
      const errors = validateSync(event);
      expect(errors).toHaveLength(0);
    });

    it('invalid fields on GlobalEventBase subclass produce validation errors', () => {
      const event = plainToInstance(TestCompanyCreatedEvent, {
        id: 'invalid-id',
        type: 'iam.company.created',
        version: '1.0.0',
        produced_at: 'not-a-date',
        producer: 'iam-service',
        actor_type: ActorType.CLIENT,
        actor_id: 'user-1',
        correlation_id: 'not-a-uuid',
        data: { name: 'Acme Corp', tenantSlug: 'acme' },
      });
      const errors = validateSync(event);
      const invalidProps = errors.map((e) => e.property);
      expect(invalidProps).toContain('id');
      expect(invalidProps).toContain('produced_at');
      expect(invalidProps).toContain('correlation_id');
    });
  });
});
