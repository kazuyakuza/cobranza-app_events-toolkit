import { IsString, IsNotEmpty } from 'class-validator';

/**
 * Validated parameter object for building GLOBAL NATS subjects.
 *
 * The {@link SubjectBuilder.buildGlobal} uses this DTO to generate subjects
 * in the format: `global.{domain}.{entity}.{action}.v{version}`
 *
 * @example
 * ```ts
 * const dto = plainToInstance(BuildGlobalSubjectDto, {
 *   domain: 'iam',
 *   entity: 'company',
 *   action: 'created',
 *   version: '1',
 * });
 * ```
 */
export class BuildGlobalSubjectDto {
  /** Business domain (e.g. `iam`, `system`, `config`) */
  @IsString()
  @IsNotEmpty()
  domain!: string;

  /** Main entity involved (e.g. `company`, `user`, `role`) */
  @IsString()
  @IsNotEmpty()
  entity!: string;

  /** Verb in past tense describing the action (e.g. `created`, `updated`, `deleted`) */
  @IsString()
  @IsNotEmpty()
  action!: string;

  /** Major version number (default: `'1'`). The `v` prefix is added automatically. */
  @IsString()
  @IsNotEmpty()
  version: string = '1';
}
