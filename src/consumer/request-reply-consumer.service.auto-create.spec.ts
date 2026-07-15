import { Test } from '@nestjs/testing';
import { RequestReplyConsumerService } from './request-reply-consumer.service';
import { REQUEST_REPLY_CONSUMER_DEPS_TOKEN } from './request-reply-consumer-deps.interface';
import { defaultDlqSubjectBuilder } from './subscribe-options.interface';
import { EventLoggerService } from '../logging/event-logger.service';

describe('RequestReplyConsumerService — subscribe with autoCreateStreams', () => {
  let jetStream: { publish: jest.Mock; subscribe: jest.Mock };
  let mockLogger: {
    logEventConsumed: jest.Mock;
    logEventError: jest.Mock;
    logEventDlq: jest.Mock;
    logEventEmitted: jest.Mock;
  };
  let jetStreamManagerMock: { streams: { find: jest.Mock; add: jest.Mock } };
  let connectionMock: { jetstreamManager: jest.Mock };

  const testSubject = 'company.*.response.v1';

  beforeEach(() => {
    jetStream = { publish: jest.fn().mockResolvedValue({}), subscribe: jest.fn() };
    mockLogger = {
      logEventConsumed: jest.fn(),
      logEventError: jest.fn(),
      logEventDlq: jest.fn(),
      logEventEmitted: jest.fn(),
    };
    jetStreamManagerMock = { streams: { find: jest.fn(), add: jest.fn().mockResolvedValue({}) } };
    connectionMock = { jetstreamManager: jest.fn().mockResolvedValue(jetStreamManagerMock) };
  });

  async function buildServiceWithAutoCreate(
    options: { connection?: unknown; autoCreateStreams?: boolean } = {},
  ): Promise<RequestReplyConsumerService> {
    const module = await Test.createTestingModule({
      providers: [
        {
          provide: REQUEST_REPLY_CONSUMER_DEPS_TOKEN,
          useFactory: (logger: EventLoggerService) => ({
            jetStream,
            logger,
            dlqSubjectBuilder: defaultDlqSubjectBuilder,
            responseSubjectPattern: testSubject,
            connection: options.connection,
            autoCreateStreams: options.autoCreateStreams,
          }),
          inject: [EventLoggerService],
        },
        { provide: EventLoggerService, useValue: mockLogger },
        RequestReplyConsumerService,
      ],
    }).compile();
    return module.get(RequestReplyConsumerService);
  }

  it('creates stream when autoCreateStreams is enabled and stream does not exist', async () => {
    jetStreamManagerMock.streams.find.mockRejectedValue(new Error('no stream matches subject'));
    const serviceWithAuto = await buildServiceWithAutoCreate({
      connection: connectionMock,
      autoCreateStreams: true,
    });
    const asyncIterable = (async function* () {})();
    jetStream.subscribe.mockResolvedValue(asyncIterable);

    await serviceWithAuto.subscribe(testSubject);

    expect(jetStreamManagerMock.streams.find).toHaveBeenCalledWith(testSubject);
    expect(jetStreamManagerMock.streams.add).toHaveBeenCalledTimes(1);
  });

  it('skips creation when stream already exists', async () => {
    jetStreamManagerMock.streams.find.mockResolvedValue({ name: 'existing' });
    const serviceWithAuto = await buildServiceWithAutoCreate({
      connection: connectionMock,
      autoCreateStreams: true,
    });
    const asyncIterable = (async function* () {})();
    jetStream.subscribe.mockResolvedValue(asyncIterable);

    await serviceWithAuto.subscribe(testSubject);

    expect(jetStreamManagerMock.streams.find).toHaveBeenCalledWith(testSubject);
    expect(jetStreamManagerMock.streams.add).not.toHaveBeenCalled();
  });

  it('skips auto-creation when autoCreateStreams is falsy', async () => {
    const serviceWithoutAuto = await buildServiceWithAutoCreate();
    const asyncIterable = (async function* () {})();
    jetStream.subscribe.mockResolvedValue(asyncIterable);

    await serviceWithoutAuto.subscribe(testSubject);

    expect(connectionMock.jetstreamManager).not.toHaveBeenCalled();
  });
});
