import { IsString, IsNotEmpty, Matches } from 'class-validator';

/** Regex matching both dashed and dashless UUID formats (versions 1–5 and nil). */
const UUID_PATTERN = /^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i;

/**
 * Validated parameter object for building NATS subjects.
 *
 * All fields are validated at runtime by class-validator decorators.
 * The {@link SubjectBuilder} uses this DTO to generate subjects in the
 * format: `company.{company_id}.{domain}.{entity}.{action}.v{version}`
 *
 * @example
 * ```ts
 * const dto = plainToInstance(BuildSubjectDto, {
 *   companyId: '550e8400-e29b-41d4-a716-446655440000',
 *   domain: 'payment',
 *   entity: 'proof',
 *   action: 'uploaded',
 *   version: '1',
 * });
 * ```
 *
 * @see docs/event-messaging-convention.md — Section 2 (Subject Naming Convention)
 */
export class BuildSubjectDto {
  /**
   * Company UUID — accepts dashed (e.g. `550e8400-e29b-41d4-a716-446655440000`)
   * or dashless format. Dashes are automatically removed during subject building.
   */
  @Matches(UUID_PATTERN, { message: 'companyId must be a valid UUID' })
  companyId!: string;

  /** Business domain (e.g. `payment`, `debt`, `client`, `notification`) */
  @IsString()
  @IsNotEmpty()
  domain!: string;

  /** Main entity involved (e.g. `proof`, `statement`, `schedule`, `attempt`) */
  @IsString()
  @IsNotEmpty()
  entity!: string;

  /** Verb in past tense describing the action (e.g. `uploaded`, `created`, `processed`) */
  @IsString()
  @IsNotEmpty()
  action!: string;

  /** Major version number (default: `'1'`). The `v` prefix is added automatically. */
  @IsString()
  @IsNotEmpty()
  version: string = '1';
}
