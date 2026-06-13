/**
 * Returns the current UTC time as an ISO 8601 string with milliseconds.
 *
 * Format: `YYYY-MM-DDTHH:mm:ss.sssZ` (e.g., `2026-06-12T23:45:12.345Z`).
 * Used for the `produced_at` field in every {@link EventEnvelope}.
 *
 * @returns ISO 8601 UTC timestamp with millisecond precision.
 * @see {@link file:///C:/projects/cobranza-app/events-toolkit/docs/event-messaging-convention.md | Event & Messaging Convention} — §3 Event Envelope, `produced_at` field.
 */
export function nowIso(): string {
  return new Date().toISOString();
}
