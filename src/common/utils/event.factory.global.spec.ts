import { validateSync } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { createGlobalEvent } from './event.factory';
import { GlobalEventContext } from '../envelope/global-event-context.interface';
import { GlobalEventEnvelope } from '../envelope/global-event-envelope.class';
import { ActorType } from '../envelope/actor-type.enum';

const EVENT_ID_REGEX = /^evt_[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function buildGlobalContext(overrides?: Partial<GlobalEventContext>): GlobalEventContext {
  return {
    type: 'iam.company.created',
    version: '1.0.0',
    producer: 'iam-service',
    actorType: ActorType.SYSTEM,
    correlationId: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
    ...overrides,
  };
}

describe('event.factory global', () => {
  describe('createGlobalEvent', () => {
    it('returns a GlobalEventEnvelope instance', () => {
      const event = createGlobalEvent({ name: 'Acme Corp' }, buildGlobalContext());
      expect(event).toBeInstanceOf(GlobalEventEnvelope);
    });

    it('auto-fills id with evt_ prefix and UUIDv7 format', () => {
      const event = createGlobalEvent({}, buildGlobalContext());
      expect(event.id).toMatch(EVENT_ID_REGEX);
    });

    it('auto-fills produced_at with ISO 8601 UTC timestamp', () => {
      const event = createGlobalEvent({}, buildGlobalContext());
      expect(event.produced_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });

    it('maps version/type/producer from context', () => {
      const event = createGlobalEvent(
        {},
        buildGlobalContext({ type: 'iam.role.created', version: '2', producer: 'rbac-service' }),
      );
      expect(event.type).toBe('iam.role.created');
      expect(event.version).toBe('2');
      expect(event.producer).toBe('rbac-service');
    });

    it('maps actorType to actor_type', () => {
      const event = createGlobalEvent({}, buildGlobalContext({ actorType: ActorType.SYSTEM }));
      expect(event.actor_type).toBe(ActorType.SYSTEM);
    });

    it('maps actorId to actor_id', () => {
      const event = createGlobalEvent({}, buildGlobalContext({ actorId: 'system-bot' }));
      expect(event.actor_id).toBe('system-bot');
    });

    it('maps correlationId to correlation_id', () => {
      const event = createGlobalEvent({}, buildGlobalContext({ correlationId: 'corr-999' }));
      expect(event.correlation_id).toBe('corr-999');
    });

    it('maps optional causationId to causation_id', () => {
      const event = createGlobalEvent({}, buildGlobalContext({ causationId: 'evt-parent' }));
      expect(event.causation_id).toBe('evt-parent');
    });

    it('maps optional traceId to trace_id', () => {
      const event = createGlobalEvent({}, buildGlobalContext({ traceId: 'trace-abc' }));
      expect(event.trace_id).toBe('trace-abc');
    });

    it('maps optional replyTo to reply_to', () => {
      const event = createGlobalEvent({}, buildGlobalContext({ replyTo: 'global.response.queue' }));
      expect(event.reply_to).toBe('global.response.queue');
    });

    it('does NOT have company_id on the result', () => {
      const event = createGlobalEvent({}, buildGlobalContext());
      expect('company_id' in event).toBe(false);
    });

    it('sets the data field to the provided payload', () => {
      const payload = { name: 'Acme Corp', tenantSlug: 'acme' };
      const event = createGlobalEvent(payload, buildGlobalContext());
      expect(event.data).toEqual(payload);
    });

    it('produces a validatable GlobalEventEnvelope with zero errors', () => {
      const event = createGlobalEvent({ name: 'Test' }, buildGlobalContext());
      const envelope = plainToInstance(GlobalEventEnvelope, event);
      const errors = validateSync(envelope);
      expect(errors).toHaveLength(0);
    });
  });
});
