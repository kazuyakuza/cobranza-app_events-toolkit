import { AnyEventEnvelope } from '../common/envelope/envelope-types';
import { EventEnvelope } from '../common/envelope/event-envelope.class';
import { GlobalEventEnvelope } from '../common/envelope/global-event-envelope.class';
import { isGlobalEnvelope } from '../common/envelope/envelope-types';
import { OutboxEntry } from './outbox.types';

/** Builds a Dead Letter Queue subject by prefixing the original subject with 'dlq.'. */
export function buildDlqSubject(subject: string): string {
  return `dlq.${subject}`;
}

/** Parses the serialized event data from an outbox entry back into an AnyEventEnvelope. */
export function parseEnvelope(entry: OutboxEntry): AnyEventEnvelope<unknown> {
  return JSON.parse(entry.eventData) as AnyEventEnvelope<unknown>;
}

/** Returns a human-readable error message from an unknown error value. */
export function extractErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Calculates exponential backoff delay: base * 2^(attempt-1). */
export function calculateBackoff(attempt: number, baseMs: number): number {
  return baseMs * Math.pow(2, attempt - 1);
}

/** Returns a promise that resolves after the given milliseconds. */
export function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

/** Builds the DLQ payload object from an outbox entry and the last error. */
export function buildDlqPayload(entry: OutboxEntry, lastError: unknown): Record<string, unknown> {
  const err = lastError instanceof Error ? lastError : new Error(String(lastError));
  return {
    originalSubject: entry.subject,
    originalEvent: JSON.parse(entry.eventData),
    error: { name: err.name, message: err.message, stack: err.stack },
    attempts: entry.attempts + 1,
    failedAt: new Date().toISOString(),
  };
}

/** Creates a DLQ envelope from a parsed event envelope and a DLQ payload. */
export function createDlqEnvelope(
  envelope: AnyEventEnvelope<unknown>,
  dlqPayload: Record<string, unknown>,
): AnyEventEnvelope<unknown> {
  const base = {
    ...envelope,
    produced_at: new Date().toISOString(),
    data: dlqPayload,
  };
  return isGlobalEnvelope(envelope) ? new GlobalEventEnvelope<unknown>(base) : new EventEnvelope<unknown>(base);
}
