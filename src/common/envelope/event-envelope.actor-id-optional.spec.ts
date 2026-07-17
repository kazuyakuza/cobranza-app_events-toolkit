import { validateSync } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { EventEnvelope } from './event-envelope.class';
import { ActorType } from './actor-type.enum';
import { createValidProperties } from './event-envelope.fixture';

/** Base valid properties with `actor_id` removed; callers set `actor_type`. */
function propertiesWithoutActorId(actorType: ActorType): Record<string, unknown> {
  const properties = { ...createValidProperties() };
  delete (properties as Record<string, unknown>).actor_id;
  return { ...properties, actor_type: actorType };
}

describe('EventEnvelope — actor_id conditional optionality', () => {
  describe('automated actors (actor_id optional)', () => {
    it.each([ActorType.SYSTEM, ActorType.SCHEDULER, ActorType.EXTERNAL_API])(
      'accepts undefined actor_id for ActorType.%s',
      (actorType) => {
        const envelope = plainToInstance(EventEnvelope, propertiesWithoutActorId(actorType));
        expect(validateSync(envelope).filter((e) => e.property === 'actor_id')).toHaveLength(0);
      },
    );

    it('accepts a present non-empty actor_id for an automated actor', () => {
      const envelope = plainToInstance(EventEnvelope, {
        ...createValidProperties(),
        actor_type: ActorType.SYSTEM,
        actor_id: 'system-bot',
      });
      expect(validateSync(envelope).filter((e) => e.property === 'actor_id')).toHaveLength(0);
    });

    it('rejects an empty string actor_id even for an automated actor', () => {
      const envelope = plainToInstance(EventEnvelope, {
        ...createValidProperties(),
        actor_type: ActorType.SYSTEM,
        actor_id: '',
      });
      expect(validateSync(envelope).filter((e) => e.property === 'actor_id').length).toBeGreaterThan(0);
    });

    it('rejects a non-string actor_id for an automated actor', () => {
      const envelope = plainToInstance(EventEnvelope, {
        ...createValidProperties(),
        actor_type: ActorType.SYSTEM,
        actor_id: 123,
      });
      expect(validateSync(envelope).filter((e) => e.property === 'actor_id').length).toBeGreaterThan(0);
    });
  });

  describe('human actors (actor_id required)', () => {
    it.each([ActorType.CLIENT, ActorType.COMPANY_USER])('rejects undefined actor_id for ActorType.%s', (actorType) => {
      const envelope = plainToInstance(EventEnvelope, propertiesWithoutActorId(actorType));
      expect(validateSync(envelope).filter((e) => e.property === 'actor_id').length).toBeGreaterThan(0);
    });

    it('accepts a present non-empty actor_id for a human actor', () => {
      const envelope = plainToInstance(EventEnvelope, {
        ...createValidProperties(),
        actor_type: ActorType.CLIENT,
        actor_id: 'user-123',
      });
      expect(validateSync(envelope).filter((e) => e.property === 'actor_id')).toHaveLength(0);
    });
  });
});
