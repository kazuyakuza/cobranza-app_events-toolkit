import { IsEnum, validateSync } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { ActorType } from '../actor-type.enum';
import { IsOptionalForSystemActors } from './is-optional-for-system-actors.validator';

/** Minimal DTO exercising the decorator on `actor_id` alongside `actor_type`. */
class ActorIdDto {
  @IsEnum(ActorType)
  actor_type!: ActorType;

  @IsOptionalForSystemActors()
  actor_id?: string;
}

function createActorIdDto(actorType: ActorType, actorId?: unknown): ActorIdDto {
  return plainToInstance(ActorIdDto, { actor_type: actorType, actor_id: actorId });
}

function countActorIdErrors(actorType: ActorType, actorId?: unknown): number {
  return validateSync(createActorIdDto(actorType, actorId)).filter((e) => e.property === 'actor_id').length;
}

describe('IsOptionalForSystemActors', () => {
  it('accepts undefined actor_id for automated actors', () => {
    expect(countActorIdErrors(ActorType.SYSTEM)).toBe(0);
    expect(countActorIdErrors(ActorType.SCHEDULER)).toBe(0);
    expect(countActorIdErrors(ActorType.EXTERNAL_API)).toBe(0);
  });

  it('rejects undefined actor_id for human actors', () => {
    expect(countActorIdErrors(ActorType.CLIENT)).toBeGreaterThan(0);
    expect(countActorIdErrors(ActorType.COMPANY_USER)).toBeGreaterThan(0);
  });

  it('accepts a non-empty string actor_id for any actor type', () => {
    expect(countActorIdErrors(ActorType.SYSTEM, 'system-bot')).toBe(0);
    expect(countActorIdErrors(ActorType.CLIENT, 'user-1')).toBe(0);
  });

  it('rejects an empty string actor_id regardless of actor type', () => {
    expect(countActorIdErrors(ActorType.SYSTEM, '')).toBeGreaterThan(0);
    expect(countActorIdErrors(ActorType.CLIENT, '')).toBeGreaterThan(0);
  });

  it('rejects a non-string actor_id', () => {
    expect(countActorIdErrors(ActorType.SYSTEM, 123)).toBeGreaterThan(0);
  });
});
