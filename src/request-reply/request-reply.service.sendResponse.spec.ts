import { Test } from '@nestjs/testing';
import { RequestReplyService } from './request-reply.service';
import { REQUEST_REPLY_DEPS_TOKEN } from './request-reply.types';
import { RequestReplyException } from '../common/errors/request-reply.exception';
import { sampleContext, defaultConfig, createDeps, createTestEnvelope } from './__tests__/request-reply-test.utils';
import type { RequestReplyConfig } from './request-reply.types';

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
  let mockNatsPublish: jest.Mock;

  const buildService = async (configOverrides: Partial<RequestReplyConfig>): Promise<RequestReplyService> => {
    const module = await Test.createTestingModule({
      providers: [
        {
          provide: REQUEST_REPLY_DEPS_TOKEN,
          useValue: createDeps(
            mockNatsRequest,
            mockPublish,
            mockLogEmitted,
            mockLogConsumed,
            mockLogError,
            { ...defaultConfig, ...configOverrides },
            mockNatsPublish,
          ),
        },
        RequestReplyService,
      ],
    }).compile();
    return module.get(RequestReplyService);
  };

  beforeEach(async () => {
    mockNatsRequest = jest.fn();
    mockNatsPublish = jest.fn();
    mockPublish = jest.fn().mockResolvedValue(undefined);
    mockLogEmitted = jest.fn();
    mockLogConsumed = jest.fn();
    mockLogError = jest.fn();
    config = { ...defaultConfig };

    const module = await Test.createTestingModule({
      providers: [
        {
          provide: REQUEST_REPLY_DEPS_TOKEN,
          useValue: createDeps(mockNatsRequest, mockPublish, mockLogEmitted, mockLogConsumed, mockLogError, config),
        },
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

  it('publishes INBOX reply_to via core NATS when fallback enabled', async () => {
    const serviceWithFallback = await buildService({ fallbackToCoreNatsOnInbox: true });
    const responseEvent = createTestEnvelope({
      id: 'evt_response-101',
      reply_to: '_INBOX.manual.company.create.abc',
    });

    await serviceWithFallback.sendResponse(sampleContext.correlationId, responseEvent);

    expect(mockNatsPublish).toHaveBeenCalledTimes(1);
    const [subject, payload] = mockNatsPublish.mock.calls[0];
    expect(subject).toBe('_INBOX.manual.company.create.abc');
    expect(payload).toBeInstanceOf(Uint8Array);
    expect(mockPublish).not.toHaveBeenCalled();
  });

  it('logs the core-NATS fallback emission once', async () => {
    const serviceWithFallback = await buildService({ fallbackToCoreNatsOnInbox: true });
    const responseEvent = createTestEnvelope({
      id: 'evt_response-102',
      reply_to: 'INBOX.reply.subject',
    });

    await serviceWithFallback.sendResponse(sampleContext.correlationId, responseEvent);

    expect(mockLogEmitted).toHaveBeenCalledTimes(1);
  });

  it('uses JetStream publish for non-INBOX reply_to even when fallback enabled', async () => {
    const serviceWithFallback = await buildService({ fallbackToCoreNatsOnInbox: true });
    const responseEvent = createTestEnvelope({
      id: 'evt_response-103',
      reply_to: 'company.abc.response.v1',
    });

    await serviceWithFallback.sendResponse(sampleContext.correlationId, responseEvent);

    expect(mockPublish).toHaveBeenCalledTimes(1);
    expect(mockNatsPublish).not.toHaveBeenCalled();
  });

  it('respects a custom coreNatsFallbackPattern', async () => {
    const serviceCustom = await buildService({
      fallbackToCoreNatsOnInbox: true,
      coreNatsFallbackPattern: '^custom\\.',
    });
    const matched = createTestEnvelope({ id: 'evt_response-104', reply_to: 'custom.foo' });
    const unmatched = createTestEnvelope({ id: 'evt_response-105', reply_to: '_INBOX.foo' });

    await serviceCustom.sendResponse(sampleContext.correlationId, matched);
    expect(mockNatsPublish).toHaveBeenCalledTimes(1);
    expect(mockPublish).not.toHaveBeenCalled();

    await serviceCustom.sendResponse(sampleContext.correlationId, unmatched);
    expect(mockPublish).toHaveBeenCalledTimes(1);
    expect(mockNatsPublish).toHaveBeenCalledTimes(1);
  });

  it('fails fast when the configured pattern is an invalid regex', async () => {
    await expect(buildService({ fallbackToCoreNatsOnInbox: true, coreNatsFallbackPattern: '(' })).rejects.toThrow();
  });
});
