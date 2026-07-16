import { Test } from '@nestjs/testing';
import { JetStreamConsumerService } from './jetstream-consumer.service';
import { defaultDlqSubjectBuilder } from './subscribe-options.interface';
import { ConsumerService } from './consumer.service';
import { EventLoggerService } from '../logging/event-logger.service';
import { JETSTREAM_CONSUMER_DEPS_TOKEN } from './jetstream-consumer-deps.interface';

describe('JetStreamConsumerService — subscribe with autoCreateStreams', () => {
  let jetStream: { publish: jest.Mock; subscribe: jest.Mock };
  let mockLogger: {
    logEventConsumed: jest.Mock;
    logEventError: jest.Mock;
    logEventDlq: jest.Mock;
    logEventEmitted: jest.Mock;
    logInfo: jest.Mock;
    logError: jest.Mock;
  };
  let jetStreamManagerMock: { streams: { find: jest.Mock; add: jest.Mock } };
  let connectionMock: { jetstreamManager: jest.Mock };

  const testSubject = 'company.550e8400.payment.proof.uploaded.v1';

  beforeEach(() => {
    jetStream = { publish: jest.fn().mockResolvedValue({}), subscribe: jest.fn() };
    mockLogger = {
      logEventConsumed: jest.fn(),
      logEventError: jest.fn(),
      logEventDlq: jest.fn(),
      logEventEmitted: jest.fn(),
      logInfo: jest.fn(),
      logError: jest.fn(),
    };
    jetStreamManagerMock = { streams: { find: jest.fn(), add: jest.fn().mockResolvedValue({}) } };
    connectionMock = { jetstreamManager: jest.fn().mockResolvedValue(jetStreamManagerMock) };
  });

  async function buildServiceWithAutoCreate(
    options: { connection?: unknown; autoCreateStreams?: boolean; streamConfig?: Record<string, unknown> } = {},
  ): Promise<JetStreamConsumerService> {
    const module = await Test.createTestingModule({
      providers: [
        {
          provide: JETSTREAM_CONSUMER_DEPS_TOKEN,
          useFactory: (cs: ConsumerService, logger: EventLoggerService) => ({
            jetStream,
            consumerService: cs,
            logger,
            dlqSubjectBuilder: defaultDlqSubjectBuilder,
            connection: options.connection,
            autoCreateStreams: options.autoCreateStreams,
            streamConfig: options.streamConfig,
          }),
          inject: [ConsumerService, EventLoggerService],
        },
        { provide: EventLoggerService, useValue: mockLogger },
        ConsumerService,
        JetStreamConsumerService,
      ],
    }).compile();
    return module.get(JetStreamConsumerService);
  }

  it('creates stream when autoCreateStreams is enabled and stream does not exist', async () => {
    jetStreamManagerMock.streams.find.mockRejectedValue(new Error('no stream matches subject'));
    const serviceWithAuto = await buildServiceWithAutoCreate({
      connection: connectionMock,
      autoCreateStreams: true,
    });
    const asyncIterable = (async function* () {})();
    jetStream.subscribe.mockResolvedValue(asyncIterable);

    await serviceWithAuto.subscribe({ subject: testSubject, handler: jest.fn() });

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

    await serviceWithAuto.subscribe({ subject: testSubject, handler: jest.fn() });

    expect(jetStreamManagerMock.streams.find).toHaveBeenCalledWith(testSubject);
    expect(jetStreamManagerMock.streams.add).not.toHaveBeenCalled();
  });

  it('skips auto-creation when autoCreateStreams is falsy', async () => {
    const serviceWithoutAuto = await buildServiceWithAutoCreate();
    const asyncIterable = (async function* () {})();
    jetStream.subscribe.mockResolvedValue(asyncIterable);

    await serviceWithoutAuto.subscribe({ subject: testSubject, handler: jest.fn() });

    expect(connectionMock.jetstreamManager).not.toHaveBeenCalled();
  });

  it('swallows race condition when add throws stream name already in use', async () => {
    jetStreamManagerMock.streams.find.mockRejectedValue(new Error('no stream matches subject'));
    jetStreamManagerMock.streams.add.mockRejectedValue(new Error('stream name already in use'));
    const serviceWithAuto = await buildServiceWithAutoCreate({
      connection: connectionMock,
      autoCreateStreams: true,
    });
    const asyncIterable = (async function* () {})();
    jetStream.subscribe.mockResolvedValue(asyncIterable);

    await expect(serviceWithAuto.subscribe({ subject: testSubject, handler: jest.fn() })).resolves.toBeUndefined();
  });

  it('forwards streamConfig overrides to jetStreamManager.streams.add', async () => {
    jetStreamManagerMock.streams.find.mockRejectedValue(new Error('no stream matches subject'));
    const serviceWithAuto = await buildServiceWithAutoCreate({
      connection: connectionMock,
      autoCreateStreams: true,
      streamConfig: { max_bytes: 42 },
    });
    const asyncIterable = (async function* () {})();
    jetStream.subscribe.mockResolvedValue(asyncIterable);

    await serviceWithAuto.subscribe({ subject: testSubject, handler: jest.fn() });

    const sent = jetStreamManagerMock.streams.add.mock.calls[0][0] as { max_bytes: number };
    expect(sent.max_bytes).toBe(42);
  });

  it('INFO-logs custom overrides via the injected logger', async () => {
    jetStreamManagerMock.streams.find.mockRejectedValue(new Error('no stream matches subject'));
    const serviceWithAuto = await buildServiceWithAutoCreate({
      connection: connectionMock,
      autoCreateStreams: true,
      streamConfig: { max_bytes: 42 },
    });
    const asyncIterable = (async function* () {})();
    jetStream.subscribe.mockResolvedValue(asyncIterable);

    await serviceWithAuto.subscribe({ subject: testSubject, handler: jest.fn() });

    expect(mockLogger.logInfo).toHaveBeenCalledTimes(1);
  });
});
