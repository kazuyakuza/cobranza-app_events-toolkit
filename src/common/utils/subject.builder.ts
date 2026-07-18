import { BuildSubjectDto } from '../dto/build-subject.dto';
import { BuildGlobalSubjectDto } from '../dto/build-global-subject.dto';

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
   * Builds a tenant NATS subject string from the validated DTO.
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

  /**
   * Builds a global NATS subject string from the validated DTO.
   *
   * Format: `global.{domain}.{entity}.{action}.v{version}`
   *
   * @param dto - Validated BuildGlobalSubjectDto instance.
   * @returns NATS subject string in the global format.
   */
  buildGlobal(dto: BuildGlobalSubjectDto): string {
    return `global.${dto.domain}.${dto.entity}.${dto.action}.v${dto.version}`;
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

/**
 * Convenience function that builds a global NATS subject from a validated DTO.
 *
 * Equivalent to `new SubjectBuilder().buildGlobal(dto)`.
 *
 * @param dto - Validated BuildGlobalSubjectDto instance.
 * @returns NATS subject string in the global format.
 */
export function buildGlobalSubject(dto: BuildGlobalSubjectDto): string {
  return new SubjectBuilder().buildGlobal(dto);
}

/**
 * Returns `true` when the subject starts with the `global.` prefix,
 * indicating it follows the global (tenant-less) subject format.
 *
 * @param subject - NATS subject string to check.
 * @returns `true` if the subject is a global subject.
 */
export function isGlobalSubject(subject: string): boolean {
  return subject.startsWith('global.');
}

/** Prefix prepended to subjects when deriving Dead Letter Queue (DLQ) subjects. */
export const DLQ_SUBJECT_PREFIX = 'dlq.';

/**
 * Builds a Dead Letter Queue (DLQ) subject by prepending {@link DLQ_SUBJECT_PREFIX}
 * to the original subject.
 *
 * Works with any subject string, including wildcard patterns used in subscriptions.
 *
 * @param originalSubject - The original NATS subject (or pattern) to derive the DLQ subject from.
 * @returns DLQ subject string with `dlq.` prefix.
 */
export function buildDlqSubject(originalSubject: string): string {
  return `${DLQ_SUBJECT_PREFIX}${originalSubject}`;
}

// ── Re-exports for backward compatibility ──
// These symbols were moved to subject-parser.ts but are re-exported here
// so that existing consumers of subject.builder are not broken.
export { RESPONSE_SUFFIX, buildResponseSubject, buildGlobalResponseSubject } from './subject-parser';
export type { SubjectParseResult, GlobalSubjectParseResult } from './subject-parser';
