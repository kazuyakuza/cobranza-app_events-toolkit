import { EventEnvelope } from '../common/envelope/event-envelope.class';
import { MockProducerService } from './mock-producer.service';
import { PublishedEvent } from './published-event.interface';

export interface EventMatchOptions {
  subject?: string;
  eventType?: string;
  companyId?: string;
}

export interface EnvelopeExpectations {
  type?: string;
  version?: string;
  producer?: string;
  company_id?: string;
  actor_type?: string;
  actor_id?: string;
  correlation_id?: string;
}

export function expectEventPublished(producer: MockProducerService, subject: string): void {
  const events = producer.getPublishedEvents();
  const matching = events.filter((e) => e.subject === subject);
  expect(matching.length).toBeGreaterThan(0);
}

export function expectNoEventsPublished(producer: MockProducerService): void {
  expect(producer.count).toBe(0);
}

export function expectEventWithMatch(producer: MockProducerService, options: EventMatchOptions): void {
  const events = producer.getPublishedEvents();
  const matching = filterPublishedEvents(events, options);
  expect(matching.length).toBeGreaterThan(0);
}

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
