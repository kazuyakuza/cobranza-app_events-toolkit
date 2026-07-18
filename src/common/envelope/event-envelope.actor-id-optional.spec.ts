import { validateSync } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { EventEnvelope } from './event-envelope.class';
import { ActorType } from './actor-type.enum';
import { createValidProperties } from './event-envelope.fixture';

function buildEnvelope(actorType: ActorType, actorId?: unknown): EventEnvelope {
  return plainToInstance(EventEnvelope, {
    ...createValidProperties(),
    actor_type: actorType,
    actor_id: actorId,
  });
}

function actorIdErrorCount(envelope: EventEnvelope): number {
  return validateSync(envelope).filter((e) => e.property === 'actor_id').length;
}

describe('EventEnvelope — actor_id conditional optionality', () => {
  describe('automated actors (actor_id optional)', () => {
    it.each([ActorType.SYSTEM, ActorType.SCHEDULER, ActorType.EXTERNAL_API])(
      'accepts undefined actor_id for ActorType.%s',
      (actorType) => {
        expect(actorIdErrorCount(buildEnvelope(actorType))).toBe(0);
      },
    );

    it('accepts a present non-empty actor_id for an automated actor', () => {
      expect(actorIdErrorCount(buildEnvelope(ActorType.SYSTEM, 'system-bot'))).toBe(0);
    });

    it('rejects an empty string actor_id even for an automated actor', () => {
      expect(actorIdErrorCount(buildEnvelope(ActorType.SYSTEM, ''))).toBeGreaterThan(0);
    });

    it('rejects a non-string actor_id for an automated actor', () => {
      expect(actorIdErrorCount(buildEnvelope(ActorType.SYSTEM, 123))).toBeGreaterThan(0);
    });
  });

  describe('human actors (actor_id required)', () => {
    it.each([ActorType.CLIENT, ActorType.COMPANY_USER])('rejects undefined actor_id for ActorType.%s', (actorType) => {
      expect(actorIdErrorCount(buildEnvelope(actorType))).toBeGreaterThan(0);
    });

    it('accepts a present non-empty actor_id for a human actor', () => {
      expect(actorIdErrorCount(buildEnvelope(ActorType.CLIENT, 'user-123'))).toBe(0);
    });
  });
});
