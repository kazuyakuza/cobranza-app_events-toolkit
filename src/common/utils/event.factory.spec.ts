import { createEvent } from './event.factory';
import { EventContext } from '../envelope/event-context.interface';
import { EventEnvelope } from '../envelope/event-envelope.class';
import { ActorType } from '../envelope/actor-type.enum';

const EVENT_ID_REGEX = /^evt_[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ISO_8601_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

function buildContext(overrides?: Partial<EventContext>): EventContext {
  return {
    type: 'payment.received',
    version: '1.0.0',
    producer: 'payment-service',
    companyId: '550e8400-e29b-41d4-a716-446655440000',
    actorType: ActorType.CLIENT,
    actorId: 'user-123',
    correlationId: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
    ...overrides,
  };
}

describe('event.factory', () => {
  describe('createEvent', () => {
    it('returns an EventEnvelope instance', () => {
      const event = createEvent({ amount: 1500 }, buildContext());
      expect(event).toBeInstanceOf(EventEnvelope);
    });

    it('auto-fills id with evt_ prefix and UUIDv7 format', () => {
      const event = createEvent({}, buildContext());
      expect(event.id).toMatch(EVENT_ID_REGEX);
    });

    it('auto-fills produced_at with ISO 8601 UTC timestamp', () => {
      const event = createEvent({}, buildContext());
      expect(event.produced_at).toMatch(ISO_8601_REGEX);
    });

    it('generates unique id per call', () => {
      const events = Array.from({ length: 100 }, () => createEvent({}, buildContext()));
      const ids = new Set(events.map((e) => e.id));
      expect(ids.size).toBe(100);
    });

    it('maps type from context correctly', () => {
      const event = createEvent({}, buildContext({ type: 'payment.proof.uploaded' }));
      expect(event.type).toBe('payment.proof.uploaded');
    });

    it('maps version from context correctly', () => {
      const event = createEvent({}, buildContext({ version: '2.1.0' }));
      expect(event.version).toBe('2.1.0');
    });

    it('maps producer from context correctly', () => {
      const event = createEvent({}, buildContext({ producer: 'debt-service' }));
      expect(event.producer).toBe('debt-service');
    });

    it('maps companyId to company_id', () => {
      const event = createEvent({}, buildContext({ companyId: 'abc-def-123' }));
      expect(event.company_id).toBe('abc-def-123');
    });

    it('maps actorType to actor_type', () => {
      const event = createEvent({}, buildContext({ actorType: ActorType.SYSTEM }));
      expect(event.actor_type).toBe(ActorType.SYSTEM);
    });

    it('maps actorId to actor_id', () => {
      const event = createEvent({}, buildContext({ actorId: 'system-bot' }));
      expect(event.actor_id).toBe('system-bot');
    });

    it('maps correlationId to correlation_id', () => {
      const event = createEvent({}, buildContext({ correlationId: 'corr-999' }));
      expect(event.correlation_id).toBe('corr-999');
    });

    it('maps optional causationId to causation_id when provided', () => {
      const event = createEvent({}, buildContext({ causationId: 'evt-parent-001' }));
      expect(event.causation_id).toBe('evt-parent-001');
    });

    it('leaves causation_id undefined when causationId is not provided', () => {
      const context = buildContext();
      delete context.causationId;
      const event = createEvent({}, context);
      expect(event.causation_id).toBeUndefined();
    });

    it('maps optional traceId to trace_id when provided', () => {
      const event = createEvent({}, buildContext({ traceId: 'trace-abc-123' }));
      expect(event.trace_id).toBe('trace-abc-123');
    });

    it('maps optional replyTo to reply_to when provided', () => {
      const event = createEvent({}, buildContext({ replyTo: 'payment.response.queue' }));
      expect(event.reply_to).toBe('payment.response.queue');
    });

    it('sets the data field to the provided payload', () => {
      const payload = { amount: 1500, currency: 'ARS' };
      const event = createEvent(payload, buildContext());
      expect(event.data).toEqual(payload);
    });

    it('preserves type inference for the data generic', () => {
      interface PaymentData {
        amount: number;
        currency: string;
      }
      const event = createEvent<PaymentData>({ amount: 1500, currency: 'ARS' }, buildContext());
      const amount: number = event.data.amount;
      expect(amount).toBe(1500);
    });
  });
});
