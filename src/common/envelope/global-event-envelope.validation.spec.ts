import { validateSync } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { GlobalEventEnvelope } from './global-event-envelope.class';
import { BaseEventEnvelope } from './base-event-envelope.class';
import { EventEnvelope } from './event-envelope.class';
import { ActorType } from './actor-type.enum';
import { createValidProperties } from './event-envelope.fixture';

function createValidGlobalProperties(): Record<string, unknown> {
  const props = createValidProperties();
  delete props.company_id;
  return props;
}

describe('GlobalEventEnvelope', () => {
  describe('validation', () => {
    it('validates with zero errors when all required fields are present and company_id is absent', () => {
      const envelope = plainToInstance(GlobalEventEnvelope, createValidGlobalProperties());
      const errors = validateSync(envelope);
      expect(errors).toHaveLength(0);
    });

    it('rejects missing id', () => {
      const envelope = plainToInstance(GlobalEventEnvelope, { ...createValidGlobalProperties(), id: undefined });
      expect(validateSync(envelope).some((e) => e.property === 'id')).toBe(true);
    });

    it('rejects missing type', () => {
      const envelope = plainToInstance(GlobalEventEnvelope, { ...createValidGlobalProperties(), type: undefined });
      expect(validateSync(envelope).some((e) => e.property === 'type')).toBe(true);
    });

    it('rejects missing produced_at', () => {
      const envelope = plainToInstance(GlobalEventEnvelope, {
        ...createValidGlobalProperties(),
        produced_at: undefined,
      });
      expect(validateSync(envelope).some((e) => e.property === 'produced_at')).toBe(true);
    });

    it('rejects missing producer', () => {
      const envelope = plainToInstance(GlobalEventEnvelope, { ...createValidGlobalProperties(), producer: undefined });
      expect(validateSync(envelope).some((e) => e.property === 'producer')).toBe(true);
    });

    it('rejects missing correlation_id', () => {
      const envelope = plainToInstance(GlobalEventEnvelope, {
        ...createValidGlobalProperties(),
        correlation_id: undefined,
      });
      expect(validateSync(envelope).some((e) => e.property === 'correlation_id')).toBe(true);
    });

    it('rejects missing actor_type', () => {
      const envelope = plainToInstance(GlobalEventEnvelope, {
        ...createValidGlobalProperties(),
        actor_type: undefined,
      });
      expect(validateSync(envelope).some((e) => e.property === 'actor_type')).toBe(true);
    });

    it('rejects missing data', () => {
      const envelope = plainToInstance(GlobalEventEnvelope, { ...createValidGlobalProperties(), data: undefined });
      expect(validateSync(envelope).some((e) => e.property === 'data')).toBe(true);
    });
  });

  describe('actor_id optional for automated actors', () => {
    it.each([ActorType.SYSTEM, ActorType.SCHEDULER, ActorType.EXTERNAL_API])(
      'accepts undefined actor_id for ActorType.%s',
      (actorType) => {
        const envelope = plainToInstance(GlobalEventEnvelope, {
          ...createValidGlobalProperties(),
          actor_type: actorType,
          actor_id: undefined,
        });
        const actorIdErrors = validateSync(envelope).filter((e) => e.property === 'actor_id');
        expect(actorIdErrors).toHaveLength(0);
      },
    );

    it('requires actor_id for CLIENT actor type', () => {
      const envelope = plainToInstance(GlobalEventEnvelope, {
        ...createValidGlobalProperties(),
        actor_type: ActorType.CLIENT,
        actor_id: undefined,
      });
      const actorIdErrors = validateSync(envelope).filter((e) => e.property === 'actor_id');
      expect(actorIdErrors.length).toBeGreaterThan(0);
    });
  });

  describe('extra company_id field is tolerated', () => {
    it('does not reject when company_id is present', () => {
      const envelope = plainToInstance(GlobalEventEnvelope, {
        ...createValidGlobalProperties(),
        company_id: '550e8400-e29b-41d4-a716-446655440000',
      });
      const errors = validateSync(envelope);
      expect(errors).toHaveLength(0);
    });
  });

  describe('type hierarchy', () => {
    it('is an instance of BaseEventEnvelope', () => {
      const envelope = new GlobalEventEnvelope();
      expect(envelope).toBeInstanceOf(BaseEventEnvelope);
    });

    it('is NOT an instance of EventEnvelope', () => {
      const envelope = new GlobalEventEnvelope();
      expect(envelope).not.toBeInstanceOf(EventEnvelope);
    });
  });
});
