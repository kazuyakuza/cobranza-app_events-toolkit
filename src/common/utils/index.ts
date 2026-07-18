/**
 * @packageDocumentation
 * Shared utility functions — subject building, UUID generation, serialization, and validation.
 */

export {
  SubjectBuilder,
  buildSubject,
  buildGlobalSubject,
  isGlobalSubject,
  buildDlqSubject,
  DLQ_SUBJECT_PREFIX,
} from './subject.builder';
export type { SubjectParseResult } from './subject.builder';
export { RESPONSE_SUFFIX, buildResponseSubject, buildGlobalResponseSubject } from './subject-parser';
export type { GlobalSubjectParseResult } from './subject-parser';
export { generateUuidV7, generateEventId } from './uuid.utils';
export { nowIso } from './date.utils';
export { createEvent } from './event.factory';
export { encodeEvent, decodeEvent } from './serialization.utils';
export { sanitizeCompanyId, assertValidCompanyId, validateSubject, sanitizeSubjectPart } from './security.utils';
