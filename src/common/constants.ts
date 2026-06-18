/**
 * Standard prefix for all event IDs.
 *
 * @see {@link file:///C:/projects/cobranza-app/events-toolkit/docs/event-messaging-convention.md | Event & Messaging Convention} — §3 Event Envelope, `id` field.
 */
export const EVENT_ID_PREFIX = 'evt_';

/** Current version of the events-toolkit library. */
export const LIBRARY_VERSION = '0.6.0';

/** Default major version for NATS subject strings (appended as `v1`). */
export const DEFAULT_SUBJECT_VERSION = '1';
