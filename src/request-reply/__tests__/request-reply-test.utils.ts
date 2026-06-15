import { EventEnvelope } from '../../common/envelope/event-envelope.class';
import { EventContext } from '../../common/envelope/event-context.interface';
import { ActorType } from '../../common/envelope/actor-type.enum';
import { RequestReplyConfig, RequestReplyDeps } from '../request-reply.types';

export const sampleContext: EventContext = {
  type: 'payment.verification.requested',
  version: '1.0.0',
  producer: 'payment-service',
  companyId: '550e8400-e29b-41d4-a716-446655440000',
  actorType: ActorType.CLIENT,
  actorId: 'user-123',
  correlationId: '660e8400-e29b-41d4-a716-446655440001',
};

export const defaultConfig: RequestReplyConfig = { defaultTimeoutMs: 5000 };

export function createDeps(
  mockNatsRequest: jest.Mock,
  mockPublish: jest.Mock,
  mockLogEmitted: jest.Mock,
  mockLogConsumed: jest.Mock,
  mockLogError: jest.Mock,
  config: RequestReplyConfig,
): RequestReplyDeps {
  return {
    natsConnection: { request: mockNatsRequest } as unknown as RequestReplyDeps['natsConnection'],
    producerService: { publish: mockPublish } as unknown as RequestReplyDeps['producerService'],
    logger: {
      logEventEmitted: mockLogEmitted,
      logEventConsumed: mockLogConsumed,
      logEventError: mockLogError,
      logEventDlq: jest.fn(),
    } as unknown as RequestReplyDeps['logger'],
    config,
  };
}

export function createTestEnvelope<T = Record<string, unknown>>(
  overrides: Partial<EventEnvelope<T>> = {},
): EventEnvelope<T> {
  return new EventEnvelope<T>({
    id: 'evt_test-123',
    type: 'payment.proof.uploaded',
    version: '1.0.0',
    produced_at: '2026-06-13T15:00:00.000Z',
    producer: 'payment-service',
    company_id: '550e8400-e29b-41d4-a716-446655440000',
    actor_type: ActorType.CLIENT,
    actor_id: 'user-123',
    correlation_id: '660e8400-e29b-41d4-a716-446655440001',
    data: {} as T,
    ...overrides,
  });
}
