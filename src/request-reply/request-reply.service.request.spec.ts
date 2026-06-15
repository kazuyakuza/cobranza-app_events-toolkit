import { Test } from '@nestjs/testing';
import { RequestReplyService } from './request-reply.service';
import { REQUEST_REPLY_DEPS_TOKEN } from './request-reply.types';
import { RequestReplyException } from '../common/errors/request-reply.exception';
import { sampleContext, defaultConfig, createDeps, createTestEnvelope } from './__tests__/request-reply-test.utils';

jest.mock('../common/utils/uuid.utils', () => ({
  generateEventId: jest.fn(() => 'evt_mock-request-uuid'),
}));

jest.mock('../common/utils/date.utils', () => ({
  nowIso: jest.fn(() => '2026-06-13T19:00:00.000Z'),
}));

describe('request', () => {
  let service: RequestReplyService;
  let mockNatsRequest: jest.Mock;
  let mockPublish: jest.Mock;
  let mockLogEmitted: jest.Mock;
  let mockLogConsumed: jest.Mock;
  let mockLogError: jest.Mock;
  let config: { defaultTimeoutMs: number };

  const replyEnvelope = createTestEnvelope({ id: 'evt_reply-001', data: { verified: true } });

  beforeEach(async () => {
    mockNatsRequest = jest.fn();
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

  it('should send request via NATS and return decoded response data', async () => {
    const encodedResponse = new TextEncoder().encode(JSON.stringify(replyEnvelope));
    mockNatsRequest.mockResolvedValue({ data: encodedResponse });

    const result = await service.request(
      'company.550e8400.payment.verification.requested.v1',
      { paymentId: 'pay-001' },
      { context: sampleContext },
    );

    expect(mockNatsRequest).toHaveBeenCalledTimes(1);
    const [subject, payload, opts] = mockNatsRequest.mock.calls[0];
    expect(subject).toBe('company.550e8400.payment.verification.requested.v1');
    expect(payload).toBeInstanceOf(Uint8Array);
    expect(opts.timeout).toBe(5000);
    expect(result.data).toEqual({ verified: true });
    expect(result.raw).toBe(encodedResponse);
  });

  it('should use custom timeout when provided', async () => {
    mockNatsRequest.mockResolvedValue({
      data: new TextEncoder().encode(JSON.stringify(replyEnvelope)),
    });

    await service.request('test.subject', { key: 'value' }, { context: sampleContext, timeoutMs: 10000 });

    const opts = mockNatsRequest.mock.calls[0][2];
    expect(opts.timeout).toBe(10000);
  });

  it('should use config default timeout when timeoutMs is not provided', async () => {
    mockNatsRequest.mockResolvedValue({
      data: new TextEncoder().encode(JSON.stringify(replyEnvelope)),
    });

    await service.request('test.subject', { key: 'value' }, { context: sampleContext });

    const opts = mockNatsRequest.mock.calls[0][2];
    expect(opts.timeout).toBe(defaultConfig.defaultTimeoutMs);
  });

  it('should build envelope with auto-generated id and timestamp', async () => {
    mockNatsRequest.mockResolvedValue({
      data: new TextEncoder().encode(JSON.stringify(replyEnvelope)),
    });

    await service.request('test.subject', { amount: 100 }, { context: sampleContext });

    const payload = mockNatsRequest.mock.calls[0][1] as Uint8Array;
    const parsed = JSON.parse(new TextDecoder().decode(payload));
    expect(parsed.id).toBe('evt_mock-request-uuid');
    expect(parsed.produced_at).toBe('2026-06-13T19:00:00.000Z');
    expect(parsed.correlation_id).toBe(sampleContext.correlationId);
  });

  it('should log request sent and reply received', async () => {
    mockNatsRequest.mockResolvedValue({
      data: new TextEncoder().encode(JSON.stringify(replyEnvelope)),
    });

    await service.request('test.subject', {}, { context: sampleContext });

    expect(mockLogEmitted).toHaveBeenCalledTimes(1);
    expect(mockLogConsumed).toHaveBeenCalledTimes(1);
  });

  it('should log reply received with response envelope context', async () => {
    mockNatsRequest.mockResolvedValue({
      data: new TextEncoder().encode(JSON.stringify(replyEnvelope)),
    });

    await service.request('test.subject', {}, { context: sampleContext });

    const consumedCtx = mockLogConsumed.mock.calls[0][0];
    expect(consumedCtx.eventId).toBe('evt_reply-001');
    expect(consumedCtx.eventType).toBe(replyEnvelope.type);
    expect(consumedCtx.correlationId).toBe(replyEnvelope.correlation_id);
  });

  it('should throw RequestReplyException and log error on NATS timeout', async () => {
    const natsError = new Error('Request timed out');
    mockNatsRequest.mockRejectedValue(natsError);

    await expect(service.request('test.subject', {}, { context: sampleContext })).rejects.toThrow(
      RequestReplyException,
    );

    expect(mockLogError).toHaveBeenCalledTimes(1);
    const errorCtx = mockLogError.mock.calls[0][0];
    expect(errorCtx.error).toBe('Request timed out');
  });

  it('should throw RequestReplyException and log error on malformed reply payload', async () => {
    const malformedData = new TextEncoder().encode('not-json{{{');
    mockNatsRequest.mockResolvedValue({ data: malformedData });

    await expect(service.request('test.subject', {}, { context: sampleContext })).rejects.toThrow(
      RequestReplyException,
    );

    expect(mockLogError).toHaveBeenCalledTimes(1);
  });

  it('should include correlationId in RequestReplyException on request failure', async () => {
    mockNatsRequest.mockRejectedValue(new Error('Connection refused'));

    try {
      await service.request('test.subject', {}, { context: sampleContext });
    } catch (error) {
      expect(error).toBeInstanceOf(RequestReplyException);
      const ex = error as RequestReplyException;
      expect(ex.correlationId).toBe(sampleContext.correlationId);
      expect(ex.eventId).toBe('evt_mock-request-uuid');
    }
  });
});
