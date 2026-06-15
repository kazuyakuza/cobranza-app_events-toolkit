import { Test } from '@nestjs/testing';
import { RequestReplyService } from './request-reply.service';
import { REQUEST_REPLY_DEPS_TOKEN } from './request-reply.types';
import { RequestReplyException } from '../common/errors/request-reply.exception';
import {
  sampleContext,
  defaultConfig,
  createDeps,
  createTestEnvelope,
} from './__tests__/request-reply-test.utils';

jest.mock('../common/utils/uuid.utils', () => ({
  generateEventId: jest.fn(() => 'evt_mock-request-uuid'),
}));

jest.mock('../common/utils/date.utils', () => ({
  nowIso: jest.fn(() => '2026-06-13T19:00:00.000Z'),
}));

describe('sendResponse', () => {
  let service: RequestReplyService;
  let mockNatsRequest: jest.Mock;
  let mockPublish: jest.Mock;
  let mockLogEmitted: jest.Mock;
  let mockLogConsumed: jest.Mock;
  let mockLogError: jest.Mock;
  let config: { defaultTimeoutMs: number };

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

  it('should publish response event to reply_to subject', async () => {
    const responseEvent = createTestEnvelope({
      id: 'evt_response-001',
      reply_to: '_INBOX.reply.subject',
    });

    await service.sendResponse(sampleContext.correlationId, responseEvent);

    expect(mockPublish).toHaveBeenCalledTimes(1);
    const [subject, event] = mockPublish.mock.calls[0];
    expect(subject).toBe('_INBOX.reply.subject');
    expect(event).toBe(responseEvent);
  });

  it('should log response sent only once via ProducerService.publish', async () => {
    const responseEvent = createTestEnvelope({
      id: 'evt_response-002',
      reply_to: '_INBOX.reply.subject',
    });

    await service.sendResponse(sampleContext.correlationId, responseEvent);

    expect(mockLogEmitted).not.toHaveBeenCalled();
    expect(mockPublish).toHaveBeenCalledTimes(1);
  });

  it('should throw RequestReplyException when reply_to is missing', async () => {
    const eventWithoutReply = createTestEnvelope({ id: 'evt_no_reply' });

    await expect(service.sendResponse(sampleContext.correlationId, eventWithoutReply)).rejects.toThrow(
      RequestReplyException,
    );

    await expect(service.sendResponse(sampleContext.correlationId, eventWithoutReply)).rejects.toThrow(
      'Cannot send response: event missing reply_to field',
    );
  });
});
