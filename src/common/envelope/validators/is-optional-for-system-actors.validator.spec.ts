import { validateSync } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { IsEnum } from 'class-validator';
import { ActorType } from '../actor-type.enum';
import { IsOptionalForSystemActors } from './is-optional-for-system-actors.validator';

/** Minimal DTO exercising the decorator on `actor_id` alongside `actor_type`. */
class ActorIdDto {
  @IsEnum(ActorType)
  actor_type!: ActorType;

  @IsOptionalForSystemActors()
  actor_id?: string;
}

function dto(actorType: ActorType, actorId?: string): ActorIdDto {
  return plainToInstance(ActorIdDto, { actor_type: actorType, actor_id: actorId });
}

function actorIdErrors(actorType: ActorType, actorId?: string): number {
  return validateSync(dto(actorType, actorId)).filter((e) => e.property === 'actor_id').length;
}

describe('IsOptionalForSystemActors', () => {
  it('accepts undefined actor_id for automated actors', () => {
    expect(actorIdErrors(ActorType.SYSTEM)).toBe(0);
    expect(actorIdErrors(ActorType.SCHEDULER)).toBe(0);
    expect(actorIdErrors(ActorType.EXTERNAL_API)).toBe(0);
  });

  it('rejects undefined actor_id for human actors', () => {
    expect(actorIdErrors(ActorType.CLIENT)).toBeGreaterThan(0);
    expect(actorIdErrors(ActorType.COMPANY_USER)).toBeGreaterThan(0);
  });

  it('accepts a non-empty string actor_id for any actor type', () => {
    expect(actorIdErrors(ActorType.SYSTEM, 'system-bot')).toBe(0);
    expect(actorIdErrors(ActorType.CLIENT, 'user-1')).toBe(0);
  });

  it('rejects an empty string actor_id regardless of actor type', () => {
    expect(actorIdErrors(ActorType.SYSTEM, '')).toBeGreaterThan(0);
    expect(actorIdErrors(ActorType.CLIENT, '')).toBeGreaterThan(0);
  });

  it('rejects a non-string actor_id', () => {
    expect(actorIdErrors(ActorType.SYSTEM, 123 as unknown as string)).toBeGreaterThan(0);
  });
});
