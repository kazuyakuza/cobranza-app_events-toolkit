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

/** Suffix appended to the action segment when deriving response subjects. */
export const RESPONSE_SUFFIX = '.response';

/** Prefix prepended to subjects when deriving Dead Letter Queue (DLQ) subjects. */
export const DLQ_SUBJECT_PREFIX = 'dlq.';

/** Parsed components of a NATS subject following the event-messaging convention. */
export interface SubjectParseResult {
  /** Company UUID (dashless) extracted from the subject. */
  companyId: string;
  /** Business domain extracted from the subject. */
  domain: string;
  /** Main entity extracted from the subject. */
  entity: string;
  /** Action (verb) extracted from the subject, including `.response` if present. */
  action: string;
  /** Version number string (digits only, without `v` prefix). */
  version: string;
}

/** Regex that matches the convention subject format and captures each segment. */
const SUBJECT_SEGMENTS_PATTERN =
  /^company\.([0-9a-f]{32})\.([a-z][a-z0-9-]*)\.([a-z][a-z0-9-]*)\.([a-z][a-z0-9-.]+)\.v(\d+)$/i;

/**
 * Parses a NATS subject string into its convention segments.
 *
 * Expected format: `company.{companyId}.{domain}.{entity}.{action}.v{version}`
 * The action segment may contain dots (e.g., `calculate.response`).
 *
 * @param subject - Full NATS subject string.
 * @returns Parsed subject components.
 * @throws Error if subject does not match the convention format.
 */
function parseSubjectSegments(subject: string): SubjectParseResult {
  const match = subject.match(SUBJECT_SEGMENTS_PATTERN);
  if (!match) {
    throw new Error(
      `Invalid subject format: "${subject}". Expected: company.{companyId}.{domain}.{entity}.{action}.v{version}`,
    );
  }
  return {
    companyId: match[1],
    domain: match[2],
    entity: match[3],
    action: match[4],
    version: match[5],
  };
}

/**
 * Derives the response subject from a request subject by inserting
 * {@link RESPONSE_SUFFIX} before the version segment.
 *
 * Follows the **alternative** response naming convention where
 * response subjects append `.response` to the request action:
 * - Request:  `company.{id}.{domain}.{entity}.{action}.v{N}`
 * - Response: `company.{id}.{domain}.{entity}.{action}.response.v{N}`
 *
 * For the **preferred** convention (past-tense outcome action),
 * use {@link SubjectBuilder.build} or {@link buildSubject} directly
 * with the appropriate action name (e.g., `calculated` instead of `calculate`).
 *
 * @param requestSubject - Full NATS request subject string.
 * @returns Response subject string with `.response` appended to the action.
 * @throws Error if `requestSubject` does not match the convention format.
 *
 * @example
 * ```ts
 * buildResponseSubject('company.550e8400e29b41d4a716446655440000.debt.schedule.calculate.v1');
 * // => 'company.550e8400e29b41d4a716446655440000.debt.schedule.calculate.response.v1'
 * ```
 */
export function buildResponseSubject(requestSubject: string): string {
  const parsed = parseSubjectSegments(requestSubject);
  const responseAction = parsed.action + RESPONSE_SUFFIX;
  return `company.${parsed.companyId}.${parsed.domain}.${parsed.entity}.${responseAction}.v${parsed.version}`;
}

/**
 * Builds a Dead Letter Queue (DLQ) subject by prepending {@link DLQ_SUBJECT_PREFIX}
 * to the original subject.
 *
 * Follows the convention defined in Section 4.3 of the event-messaging convention:
 * - Original: `company.{id}.{domain}.{entity}.{action}.v{version}`
 * - DLQ:      `dlq.company.{id}.{domain}.{entity}.{action}.v{version}`
 *
 * Works with any subject string, including wildcard patterns used in subscriptions.
 *
 * @param originalSubject - The original NATS subject (or pattern) to derive the DLQ subject from.
 * @returns DLQ subject string with `dlq.` prefix.
 *
 * @example
 * ```ts
 * buildDlqSubject('company.550e8400e29b41d4a716446655440000.payment.proof.uploaded.v1');
 * // => 'dlq.company.550e8400e29b41d4a716446655440000.payment.proof.uploaded.v1'
 *
 * buildDlqSubject('company.*.payment.proof.uploaded.v1');
 * // => 'dlq.company.*.payment.proof.uploaded.v1'
 * ```
 *
 * @see docs/event-messaging-convention.md — Section 4.3 (Dead Letter Queue)
 */
export function buildDlqSubject(originalSubject: string): string {
  return `${DLQ_SUBJECT_PREFIX}${originalSubject}`;
}
