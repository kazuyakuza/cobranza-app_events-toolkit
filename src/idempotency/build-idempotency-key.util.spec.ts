import { buildIdempotencyKey } from './build-idempotency-key.util';
import { EventEnvelope } from '../common/envelope/event-envelope.class';
import { GlobalEventEnvelope } from '../common/envelope/global-event-envelope.class';
import { ActorType } from '../common/envelope/actor-type.enum';

function createEventEnvelope(id: string, correlationId: string): EventEnvelope<unknown> {
  return new EventEnvelope<unknown>({
    id,
    correlation_id: correlationId,
    type: 'test.event',
    version: '1.0.0',
    produced_at: new Date().toISOString(),
    producer: 'test-service',
    company_id: '00000000-0000-0000-0000-000000000001',
    actor_type: ActorType.SYSTEM,
    actor_id: 'actor-1',
    data: {},
  });
}

function createGlobalEventEnvelope(id: string, correlationId: string): GlobalEventEnvelope<unknown> {
  return new GlobalEventEnvelope<unknown>({
    id,
    correlation_id: correlationId,
    type: 'test.global.event',
    version: '1.0.0',
    produced_at: new Date().toISOString(),
    producer: 'test-service',
    actor_type: ActorType.SYSTEM,
    actor_id: 'actor-1',
    data: {},
  });
}

describe('buildIdempotencyKey', () => {
  it('returns event.id + ":" + event.correlation_id for EventEnvelope', () => {
    const key = buildIdempotencyKey(createEventEnvelope('evt_001', 'corr_001'));
    expect(key).toBe('evt_001:corr_001');
  });

  it('returns event.id + ":" + event.correlation_id for GlobalEventEnvelope', () => {
    const key = buildIdempotencyKey(createGlobalEventEnvelope('evt_002', 'corr_002'));
    expect(key).toBe('evt_002:corr_002');
  });

  it('handles correlation_id with dashes', () => {
    const key = buildIdempotencyKey(
      createEventEnvelope('evt_003', '550e8400-e29b-41d4-a716-446655440000'),
    );
    expect(key).toBe('evt_003:550e8400-e29b-41d4-a716-446655440000');
  });
});
