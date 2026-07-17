import {
  ValidationArguments,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  registerDecorator,
} from 'class-validator';
import { ActorType } from '../actor-type.enum';

/** Automated (non-human) actor types that have no database actor row. */
const AUTOMATED_ACTOR_TYPES: ReadonlyArray<ActorType> = [ActorType.SYSTEM, ActorType.SCHEDULER, ActorType.EXTERNAL_API];

/** Returns true when the value is null or undefined (i.e. not supplied). */
function isAbsent(value: unknown): boolean {
  return value === null || value === undefined;
}

/** Returns true when the value is a non-empty string. */
function isNonEmptyString(value: unknown): boolean {
  return typeof value === 'string' && value.length > 0;
}

/** Returns true when the validated object's actor_type is an automated actor. */
function isAutomatedActor(target: { actor_type?: ActorType }): boolean {
  return AUTOMATED_ACTOR_TYPES.includes(target.actor_type as ActorType);
}

/**
 * Constraint implementing the `actor_id` optionality rule:
 * optional for {@link ActorType.SYSTEM}, {@link ActorType.SCHEDULER},
 * and {@link ActorType.EXTERNAL_API}; required (non-empty string) for
 * human actors ({@link ActorType.CLIENT}, {@link ActorType.COMPANY_USER}).
 * When supplied for any actor type, `actor_id` must be a non-empty string.
 */
@ValidatorConstraint({ name: 'isOptionalForSystemActors', async: false })
class IsOptionalForSystemActorsConstraint implements ValidatorConstraintInterface {
  validate(value: unknown, args: ValidationArguments): boolean {
    const target = args.object as { actor_type?: ActorType };
    if (isAutomatedActor(target) && isAbsent(value)) {
      return true;
    }
    return isNonEmptyString(value);
  }

  defaultMessage(): string {
    return 'actor_id must be a non-empty string for human actors (client, company_user)';
  }
}

/**
 * Decorator factory that registers {@link IsOptionalForSystemActorsConstraint}
 * on `actor_id`, replacing `@IsString() @IsNotEmpty()` for that property.
 *
 * Exported via the public API so downstream DTOs mirroring the envelope
 * contract can apply the same conditional optionality.
 *
 * @example
 * ```ts
 * class MyEnvelope {
 *   @IsEnum(ActorType)
 *   actor_type!: ActorType;
 *
 *   @IsOptionalForSystemActors()
 *   actor_id?: string;
 * }
 * ```
 *
 * @param options - Optional class-validator {@link ValidationOptions} (message/groups).
 */
export function IsOptionalForSystemActors(options?: ValidationOptions): PropertyDecorator {
  return (target, propertyKey) => {
    registerDecorator({
      name: 'isOptionalForSystemActors',
      target: target.constructor,
      propertyName: String(propertyKey),
      constraints: [],
      options,
      validator: IsOptionalForSystemActorsConstraint,
    });
  };
}
