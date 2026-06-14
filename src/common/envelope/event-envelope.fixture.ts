import { EventEnvelope } from './event-envelope.class';
import { ActorType } from './actor-type.enum';

export function createValidProperties(): Partial<EventEnvelope> {
  return {
    id: 'evt_01929390-7abc-7123-8def-0123456789ab',
    type: 'payment.proof.uploaded',
    version: '1.0.0',
    produced_at: '2026-01-15T10:30:00.000Z',
    producer: 'payment-service',
    company_id: '550e8400-e29b-41d4-a716-446655440000',
    actor_type: ActorType.SYSTEM,
    actor_id: 'user-123',
    correlation_id: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
    data: { amount: 100 },
  };
}
