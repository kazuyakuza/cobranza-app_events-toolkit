import { expect } from '@jest/globals';
import { EventEnvelope } from '../common/envelope/event-envelope.class';
import { MockProducerService } from './mock-producer.service';
import { PublishedEvent } from './published-event.interface';

/** Filter criteria for matching published events in assertions. */
export interface EventMatchOptions {
  /** Exact NATS subject to match. */
  subject?: string;
  /** Event type in dot-notation (e.g. `'payment.proof.uploaded'`). */
  eventType?: string;
  /** Tenant UUID to match against `company_id`. */
  companyId?: string;
}

/** Expected envelope field values for `expectEnvelope` assertions. */
export interface EnvelopeExpectations {
  /** Expected event type. */
  type?: string;
  /** Expected schema version. */
  version?: string;
  /** Expected producing microservice name. */
  producer?: string;
  /** Expected tenant UUID. */
  company_id?: string;
  /** Expected actor type. */
  actor_type?: string;
  /** Expected actor identifier. */
  actor_id?: string;
  /** Expected correlation ID. */
  correlation_id?: string;
}

/**
 * Asserts that at least one event was published to the given NATS subject.
 * @param producer - The mock producer service to inspect.
 * @param subject - The exact subject string to match.
 */
export function expectEventPublished(producer: MockProducerService, subject: string): void {
  const events = producer.getPublishedEvents();
  const matching = events.filter((e) => e.subject === subject);
  expect(matching.length).toBeGreaterThan(0);
}

/**
 * Asserts that no events have been published.
 * @param producer - The mock producer service to inspect.
 */
export function expectNoEventsPublished(producer: MockProducerService): void {
  expect(producer.count).toBe(0);
}

/**
 * Asserts that at least one published event matches the given filter criteria.
 * @param producer - The mock producer service to inspect.
 * @param options - Filter criteria (subject, eventType, companyId).
 */
export function expectEventWithMatch(producer: MockProducerService, options: EventMatchOptions): void {
  const events = producer.getPublishedEvents();
  const matching = filterPublishedEvents(events, options);
  expect(matching.length).toBeGreaterThan(0);
}

/**
 * Asserts that an event envelope's fields match the expected values.
 * Only fields present in `expectations` are checked; omitted fields are ignored.
 * @param envelope - The event envelope to validate.
 * @param expectations - Expected field values.
 */
export function expectEnvelope(envelope: EventEnvelope<unknown>, expectations: EnvelopeExpectations): void {
  const assertions = buildEnvelopeAssertions(envelope, expectations);
  for (const assertion of assertions) {
    assertion();
  }
}

function filterPublishedEvents(events: ReadonlyArray<PublishedEvent>, options: EventMatchOptions): PublishedEvent[] {
  let filtered = [...events];
  if (options.subject) {
    filtered = filtered.filter((e) => e.subject === options.subject);
  }
  if (options.eventType) {
    filtered = filtered.filter((e) => e.event.type === options.eventType);
  }
  if (options.companyId) {
    filtered = filtered.filter((e) => e.event.company_id === options.companyId);
  }
  return filtered;
}

function buildEnvelopeAssertions(
  envelope: EventEnvelope<unknown>,
  expectations: EnvelopeExpectations,
): Array<() => void> {
  const assertions: Array<() => void> = [];
  if (expectations.type) {
    assertions.push(() => expect(envelope.type).toBe(expectations.type));
  }
  if (expectations.version) {
    assertions.push(() => expect(envelope.version).toBe(expectations.version));
  }
  if (expectations.producer) {
    assertions.push(() => expect(envelope.producer).toBe(expectations.producer));
  }
  if (expectations.company_id) {
    assertions.push(() => expect(envelope.company_id).toBe(expectations.company_id));
  }
  if (expectations.actor_type) {
    assertions.push(() => expect(envelope.actor_type).toBe(expectations.actor_type));
  }
  if (expectations.actor_id) {
    assertions.push(() => expect(envelope.actor_id).toBe(expectations.actor_id));
  }
  if (expectations.correlation_id) {
    assertions.push(() => expect(envelope.correlation_id).toBe(expectations.correlation_id));
  }
  return assertions;
}
