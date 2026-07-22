import { Test } from '@nestjs/testing';
import { RequestReplyService } from './request-reply.service';
import { REQUEST_REPLY_DEPS_TOKEN } from './request-reply.types';
import { defaultConfig, createDeps, createTestEnvelope } from './__tests__/request-reply-test.utils';

jest.mock('../common/utils/uuid.utils', () => ({
  generateEventId: jest.fn(() => 'evt_mock-request-uuid'),
}));

jest.mock('../common/utils/date.utils', () => ({
  nowIso: jest.fn(() => '2026-06-13T19:00:00.000Z'),
}));

describe('isRequestReplyMessage', () => {
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

  it('should return true when event has reply_to', () => {
    const event = createTestEnvelope({ reply_to: '_INBOX.abc123' });
    expect(service.isRequestReplyMessage(event)).toBe(true);
  });

  it('should return false when reply_to is undefined', () => {
    const event = createTestEnvelope({});
    expect(service.isRequestReplyMessage(event)).toBe(false);
  });

  it('should return false when reply_to is empty string', () => {
    const event = createTestEnvelope({ reply_to: '' });
    expect(service.isRequestReplyMessage(event)).toBe(false);
  });
});
