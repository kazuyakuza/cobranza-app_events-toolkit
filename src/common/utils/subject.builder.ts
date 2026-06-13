import { BuildSubjectDto } from '../dto/build-subject.dto';

/**
 * Builds NATS subjects in the standardized format defined by the
 * event-messaging convention.
 *
 * Subject format: `company.{company_id}.{domain}.{entity}.{action}.v{version}`
 *
 * This is the single entry point for all subject generation across the platform.
 * All microservices MUST use this builder to ensure consistent subject naming.
 *
 * @example
 * ```ts
 * const builder = new SubjectBuilder();
 * const subject = builder.build({
 *   companyId: '550e8400-e29b-41d4-a716-446655440000',
 *   domain: 'payment',
 *   entity: 'proof',
 *   action: 'uploaded',
 *   version: '1',
 * });
 * // => 'company.550e8400e29b41d4a716446655440000.payment.proof.uploaded.v1'
 * ```
 *
 * @see docs/event-messaging-convention.md — Section 2 (Subject Naming Convention)
 */
export class SubjectBuilder {
  /**
   * Builds a NATS subject string from the validated DTO.
   *
   * Automatically removes dashes from the {@link BuildSubjectDto.companyId}
   * to comply with the convention recommendation of dashless UUIDs in subjects.
   *
   * @param dto - Validated BuildSubjectDto instance.
   * @returns NATS subject string in the standard format.
   */
  build(dto: BuildSubjectDto): string {
    const companyId = dto.companyId.replace(/-/g, '');
    return `company.${companyId}.${dto.domain}.${dto.entity}.${dto.action}.v${dto.version}`;
  }
}

/**
 * Convenience function that builds a NATS subject from a validated DTO.
 *
 * Equivalent to `new SubjectBuilder().build(dto)`.
 *
 * @param dto - Validated BuildSubjectDto instance.
 * @returns NATS subject string in the standard format.
 */
export function buildSubject(dto: BuildSubjectDto): string {
  return new SubjectBuilder().build(dto);
}
