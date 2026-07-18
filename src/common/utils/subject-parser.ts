/** Suffix appended to the action segment when deriving response subjects. */
export const RESPONSE_SUFFIX = '.response';

/** Parsed components of a NATS subject following the tenant event-messaging convention. */
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

/** Parsed components of a global NATS subject. */
export interface GlobalSubjectParseResult {
  /** Business domain extracted from the subject. */
  domain: string;
  /** Main entity extracted from the subject. */
  entity: string;
  /** Action (verb) extracted from the subject, including `.response` if present. */
  action: string;
  /** Version number string (digits only, without `v` prefix). */
  version: string;
}

/** Regex that matches the convention tenant subject format and captures each segment. */
const SUBJECT_SEGMENTS_PATTERN =
  /^company\.([0-9a-f]{32})\.([a-z][a-z0-9-]*)\.([a-z][a-z0-9-]*)\.([a-z][a-z0-9-.]+)\.v(\d+)$/i;

/** Regex that matches the global subject format and captures each segment. */
const GLOBAL_SUBJECT_SEGMENTS_PATTERN = /^global\.([a-z][a-z0-9-]*)\.([a-z][a-z0-9-]*)\.([a-z][a-z0-9-.]+)\.v(\d+)$/i;

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
 * Derives the response subject from a tenant request subject by inserting
 * {@link RESPONSE_SUFFIX} before the version segment.
 *
 * Follows the **alternative** response naming convention where
 * response subjects append `.response` to the request action:
 * - Request:  `company.{id}.{domain}.{entity}.{action}.v{N}`
 * - Response: `company.{id}.{domain}.{entity}.{action}.response.v{N}`
 *
 * @param requestSubject - Full NATS request subject string.
 * @returns Response subject string with `.response` appended to the action.
 * @throws Error if `requestSubject` does not match the convention format.
 */
export function buildResponseSubject(requestSubject: string): string {
  const parsed = parseSubjectSegments(requestSubject);
  const responseAction = parsed.action + RESPONSE_SUFFIX;
  return `company.${parsed.companyId}.${parsed.domain}.${parsed.entity}.${responseAction}.v${parsed.version}`;
}

/**
 * Parses a global NATS subject string into its segments.
 *
 * Expected format: `global.{domain}.{entity}.{action}.v{version}`
 *
 * @param subject - Full global NATS subject string.
 * @returns Parsed global subject components.
 * @throws Error if subject does not match the global format.
 */
function parseGlobalSubjectSegments(subject: string): GlobalSubjectParseResult {
  const match = subject.match(GLOBAL_SUBJECT_SEGMENTS_PATTERN);
  if (!match) {
    throw new Error(
      `Invalid global subject format: "${subject}". Expected: global.{domain}.{entity}.{action}.v{version}`,
    );
  }
  return {
    domain: match[1],
    entity: match[2],
    action: match[3],
    version: match[4],
  };
}

/**
 * Derives the response subject from a global request subject by inserting
 * {@link RESPONSE_SUFFIX} before the version segment.
 *
 * - Request:  `global.{domain}.{entity}.{action}.v{N}`
 * - Response: `global.{domain}.{entity}.{action}.response.v{N}`
 *
 * @param requestSubject - Full global NATS request subject string.
 * @returns Response subject string with `.response` appended to the action.
 * @throws Error if `requestSubject` does not match the global format.
 */
export function buildGlobalResponseSubject(requestSubject: string): string {
  const parsed = parseGlobalSubjectSegments(requestSubject);
  const responseAction = parsed.action + RESPONSE_SUFFIX;
  return `global.${parsed.domain}.${parsed.entity}.${responseAction}.v${parsed.version}`;
}
