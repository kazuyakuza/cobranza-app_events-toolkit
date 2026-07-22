import { Test } from '@nestjs/testing';
import { RequestReplyService } from './request-reply.service';
import { EventContext } from '../common/envelope/event-context.interface';
import { REQUEST_REPLY_DEPS_TOKEN } from './request-reply.types';
import { ActorType } from '../common/envelope/actor-type.enum';
import { defaultConfig, createDeps, createTestEnvelope } from './__tests__/request-reply-test.utils';

jest.mock('../common/utils/uuid.utils', () => ({
  generateEventId: jest.fn(() => 'evt_mock-request-uuid'),
}));

jest.mock('../common/utils/date.utils', () => ({
  nowIso: jest.fn(() => '2026-06-13T19:00:00.000Z'),
}));

describe('buildResponseEnvelope', () => {
  let service: RequestReplyService;

  let mockPublish: jest.Mock;
  let mockLogEmitted: jest.Mock;
  let mockLogConsumed: jest.Mock;
  let mockLogError: jest.Mock;

  beforeEach(async () => {
    mockPublish = jest.fn().mockResolvedValue(undefined);
    mockLogEmitted = jest.fn();
    mockLogConsumed = jest.fn();
    mockLogError = jest.fn();

    const module = await Test.createTestingModule({
      providers: [
        {
          provide: REQUEST_REPLY_DEPS_TOKEN,
          useValue: createDeps({ mockPublish, mockLogEmitted, mockLogConsumed, mockLogError, config: defaultConfig }),
        },
        RequestReplyService,
      ],
    }).compile();

    service = module.get(RequestReplyService);
  });

  it('should preserve correlation_id from request event', () => {
    const requestEvent = createTestEnvelope({
      id: 'evt_request-001',
      correlation_id: '660e8400-e29b-41d4-a716-446655440001',
    });
    const responseContext: EventContext = {
      type: 'payment.verification.completed',
      version: '1.0.0',
      producer: 'verification-service',
      companyId: '550e8400-e29b-41d4-a716-446655440000',
      actorType: ActorType.CLIENT,
      actorId: 'user-456',
      correlationId: 'will-be-overridden',
    };

    const response = service.buildResponseEnvelope({
      requestEvent,
      responseContext,
      responseData: { verified: true },
    });

    expect(response.correlation_id).toBe('660e8400-e29b-41d4-a716-446655440001');
  });

  it('should set causation_id to request event id', () => {
    const requestEvent = createTestEnvelope({ id: 'evt_request-002' });
    const responseContext: EventContext = {
      type: 'payment.verification.completed',
      version: '1.0.0',
      producer: 'verification-service',
      companyId: '550e8400-e29b-41d4-a716-446655440000',
      actorType: ActorType.CLIENT,
      actorId: 'user-456',
      correlationId: 'any-value',
    };

    const response = service.buildResponseEnvelope({
      requestEvent,
      responseContext,
      responseData: { verified: true },
    });

    expect(response.causation_id).toBe('evt_request-002');
  });

  it('should populate all envelope fields from responseContext except correlation/causation', () => {
    const requestEvent = createTestEnvelope({
      id: 'evt_request-003',
      correlation_id: 'corr-003',
    });
    const responseContext: EventContext = {
      type: 'payment.verification.completed',
      version: '2.0.0',
      producer: 'verification-service',
      companyId: 'company-uuid',
      actorType: ActorType.SYSTEM,
      actorId: 'system',
      correlationId: 'will-be-overridden',
    };

    const response = service.buildResponseEnvelope({
      requestEvent,
      responseContext,
      responseData: { status: 'approved' },
    });

    expect(response.type).toBe('payment.verification.completed');
    expect(response.version).toBe('2.0.0');
    expect(response.producer).toBe('verification-service');
    expect(response.company_id).toBe('company-uuid');
    expect(response.actor_type).toBe(ActorType.SYSTEM);
    expect(response.actor_id).toBe('system');
    expect(response.data).toEqual({ status: 'approved' });
    expect(response.correlation_id).toBe('corr-003');
    expect(response.causation_id).toBe('evt_request-003');
  });
});
