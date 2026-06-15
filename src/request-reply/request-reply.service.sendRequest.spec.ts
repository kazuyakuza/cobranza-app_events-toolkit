import { Test } from '@nestjs/testing';
import { RequestReplyService } from './request-reply.service';
import { EventContext } from '../common/envelope/event-context.interface';
import { REQUEST_REPLY_DEPS_TOKEN } from './request-reply.types';
import { EventEnvelope } from '../common/envelope/event-envelope.class';
import { RequestReplyException } from '../common/errors/request-reply.exception';
import {
  sampleContext,
  defaultConfig,
  createDeps,
} from './__tests__/request-reply-test.utils';

jest.mock('../common/utils/uuid.utils', () => ({
  generateEventId: jest.fn(() => 'evt_mock-request-uuid'),
}));

jest.mock('../common/utils/date.utils', () => ({
  nowIso: jest.fn(() => '2026-06-13T19:00:00.000Z'),
}));

describe('sendRequest', () => {
  let service: RequestReplyService;
  let mockNatsRequest: jest.Mock;
  let mockPublish: jest.Mock;
  let mockLogEmitted: jest.Mock;
  let mockLogConsumed: jest.Mock;
  let mockLogError: jest.Mock;
  let config: { defaultTimeoutMs: number };

  const replyContext: EventContext = {
    ...sampleContext,
    replyTo: '_INBOX.test.reply',
  };

  beforeEach(async () => {
    mockNatsRequest = jest.fn();
    mockPublish = jest.fn().mockResolvedValue(undefined);
    mockLogEmitted = jest.fn();
    mockLogConsumed = jest.fn();
    mockLogError = jest.fn();
    config = { ...defaultConfig };

    const module = await Test.createTestingModule({
      providers: [
        { provide: REQUEST_REPLY_DEPS_TOKEN, useValue: createDeps(mockNatsRequest, mockPublish, mockLogEmitted, mockLogConsumed, mockLogError, config) },
        RequestReplyService,
      ],
    }).compile();

    service = module.get(RequestReplyService);
  });

  it('should throw RequestReplyException when replyTo is not set in context', async () => {
    const contextWithoutReply = { ...sampleContext };
    delete (contextWithoutReply as Partial<EventContext>).replyTo;

    await expect(
      service.sendRequest({
        subject: 'test.subject',
        payload: { key: 'value' },
        context: contextWithoutReply,
      }),
    ).rejects.toThrow(RequestReplyException);
  });

  it('should throw RequestReplyException with message when replyTo is empty string', async () => {
    const contextWithEmptyReply: EventContext = {
      ...sampleContext,
      replyTo: '',
    };

    await expect(
      service.sendRequest({
        subject: 'test.subject',
        payload: {},
        context: contextWithEmptyReply,
      }),
    ).rejects.toThrow('sendRequest requires reply_to in context');
  });

  it('should publish envelope via ProducerService and return correlationId', async () => {
    const result = await service.sendRequest({
      subject: 'test.subject',
      payload: { paymentId: 'pay-001' },
      context: replyContext,
    });

    expect(mockPublish).toHaveBeenCalledTimes(1);
    const [subject, publishedEnvelope] = mockPublish.mock.calls[0];
    expect(subject).toBe('test.subject');
    expect(publishedEnvelope.reply_to).toBe('_INBOX.test.reply');
    expect(result.correlationId).toBe('660e8400-e29b-41d4-a716-446655440001');
  });

  it('should build envelope with auto-generated id and timestamp', async () => {
    await service.sendRequest({
      subject: 'test.subject',
      payload: { amount: 100 },
      context: replyContext,
    });

    const publishedEnvelope = mockPublish.mock.calls[0][1] as EventEnvelope<unknown>;
    expect(publishedEnvelope.id).toBe('evt_mock-request-uuid');
    expect(publishedEnvelope.produced_at).toBe('2026-06-13T19:00:00.000Z');
    expect(publishedEnvelope.correlation_id).toBe(sampleContext.correlationId);
  });

  it('should not call natsConnection.request (fire-and-forget)', async () => {
    await service.sendRequest({
      subject: 'test.subject',
      payload: {},
      context: replyContext,
    });

    expect(mockNatsRequest).not.toHaveBeenCalled();
  });
});
