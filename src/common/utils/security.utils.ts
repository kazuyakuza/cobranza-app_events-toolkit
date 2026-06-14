/** Regex matching dashless UUID format (32 hex chars). */
const DASHLESS_UUID_PATTERN = /^[0-9a-f]{32}$/i;

/** Regex matching dashed UUID format. */
const DASHED_UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Regex matching a valid NATS subject per the event-messaging convention. */
const SUBJECT_PATTERN = /^company\.[0-9a-f]{32}\.[a-z][a-z0-9-]*\.[a-z][a-z0-9-]*\.[a-z][a-z0-9-]*\.v[0-9]+$/;

/**
 * Normalizes a company ID to dashless lowercase UUID format.
 * @throws Error if the input is not a valid UUID.
 */
export function sanitizeCompanyId(companyId: string): string {
  const normalized = companyId.trim().toLowerCase().replace(/-/g, '');
  if (!DASHLESS_UUID_PATTERN.test(normalized)) {
    throw new Error(`Invalid company ID: "${companyId}" is not a valid UUID`);
  }
  return normalized;
}

/**
 * Asserts that a company ID is a valid UUID (dashed or dashless).
 * @throws Error if the input does not match either UUID format.
 */
export function assertValidCompanyId(companyId: string): void {
  const trimmed = companyId.trim();
  const isValid = DASHED_UUID_PATTERN.test(trimmed) || DASHLESS_UUID_PATTERN.test(trimmed);
  if (!isValid) {
    throw new Error(`Invalid company ID: "${companyId}" is not a valid UUID`);
  }
}

/** Checks whether a subject string conforms to the event-messaging naming convention. */
export function validateSubject(subject: string): boolean {
  return SUBJECT_PATTERN.test(subject);
}

/**
 * Sanitizes a single NATS subject segment: lowercases, strips invalid characters,
 * collapses consecutive dashes, and trims leading/trailing dashes.
 * @throws Error if sanitization produces an empty string.
 */
export function sanitizeSubjectPart(part: string): string {
  const sanitized = part
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  if (sanitized.length === 0) {
    throw new Error(`Invalid subject part: "${part}" produced an empty string after sanitization`);
  }
  return sanitized;
}
