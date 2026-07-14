/** Prefix prepended to auto-generated JetStream stream names. */
export const STREAM_NAME_PREFIX = 'auto-';

/** Error fragment indicating no stream matches the given subject. */
export const NO_STREAM_MATCHES_FRAGMENT = 'no stream matches subject';

/** Error fragment indicating a stream name is already in use. */
export const STREAM_NAME_INUSE_FRAGMENT = 'stream name already in use';

/**
 * Builds a valid JetStream stream name from a NATS subject.
 *
 * Consecutive non-alphanumeric characters are collapsed into a single hyphen
 * and the result is lowercased. For example:
 * - `company.*.response.v1` → `auto-company-response-v1`
 * - `EVENT.v2` → `auto-event-v2`
 */
export function buildStreamName(subject: string): string {
  const sanitized = subject.replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase();
  return `${STREAM_NAME_PREFIX}${sanitized}`;
}
