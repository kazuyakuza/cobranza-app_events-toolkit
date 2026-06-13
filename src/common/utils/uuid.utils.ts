import { v7 as uuidv7 } from 'uuid';
import { EVENT_ID_PREFIX } from '../constants';

/**
 * Generates a raw UUIDv7 (RFC 9562).
 *
 * UUIDv7 is timestamp-ordered, making it ideal for database indexing
 * and chronological event ordering in JetStream streams.
 *
 * @returns A UUIDv7 string in standard 8-4-4-4-12 hex format.
 */
export function generateUuidV7(): string {
  return uuidv7();
}

/**
 * Generates a UUIDv7 event identifier with the standard `evt_` prefix.
 *
 * Format: `evt_` + UUIDv7 (e.g., `evt_018f4a3e-...`).
 * Used as the `id` field in every {@link EventEnvelope}.
 *
 * @returns Event ID string with `evt_` prefix.
 */
export function generateEventId(): string {
  return `${EVENT_ID_PREFIX}${uuidv7()}`;
}
