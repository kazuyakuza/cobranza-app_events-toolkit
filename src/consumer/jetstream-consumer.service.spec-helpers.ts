import { JsMsg } from 'nats';
import { ActorType } from '../common/envelope/actor-type.enum';

export function createValidEventJson(): Record<string, unknown> {
  return {
    id: 'evt_test-123',
    type: 'payment.proof.uploaded',
    version: '1.0.0',
    produced_at: '2026-06-13T15:00:00.000Z',
    producer: 'payment-service',
    company_id: '550e8400-e29b-41d4-a716-446655440000',
    actor_type: ActorType.CLIENT,
    actor_id: 'user-123',
    correlation_id: '660e8400-e29b-41d4-a716-446655440001',
    data: { amount: 100 },
  };
}

export function createJsMsg(data: Record<string, unknown>, subject: string): JsMsg {
  const payload = new TextEncoder().encode(JSON.stringify(data));
  return {
    seq: 1,
    subject,
    data: payload,
    redelivered: false,
    headers: undefined,
    ack: jest.fn(),
    nak: jest.fn(),
    term: jest.fn(),
    working: jest.fn(),
    ackAck: jest.fn().mockResolvedValue(true),
    next: jest.fn(),
    sid: 1,
    info: {} as never,
    json: jest.fn().mockReturnValue(data),
    string: jest.fn().mockReturnValue(JSON.stringify(data)),
  } as unknown as JsMsg;
}
