import { EventLoggerService } from '../logging/event-logger.service';
import { JetStreamClient, NatsConnection } from 'nats';
import { DiscoveryModule } from '@nestjs/core';
import { ConsumerModule, CONSUMER_MODULE_OPTIONS } from './consumer.module';
import { JETSTREAM_CONSUMER_DEPS_TOKEN } from './jetstream-consumer-deps.interface';
import { REQUEST_REPLY_CONSUMER_DEPS_TOKEN } from './request-reply-consumer-deps.interface';
import { ConsumerService } from './consumer.service';
import { JetStreamConsumerService } from './jetstream-consumer.service';
import { OnEventExplorer } from './decorators/on-event.explorer';
import { OnRequestReplyExplorer } from './decorators/on-request-reply.explorer';
import { RequestReplyConsumerService } from './request-reply-consumer.service';

describe('ConsumerModule', () => {
  const mockJetStream = { publish: jest.fn(), subscribe: jest.fn() } as unknown as JetStreamClient;
  const mockLogger = {
    logEventConsumed: jest.fn(),
    logEventError: jest.fn(),
    logEventDlq: jest.fn(),
  } as unknown as EventLoggerService;

  it('should resolve JetStream from connection via forRoot', () => {
    const mockConnection: Partial<NatsConnection> & { jetstream: jest.Mock } = {
      jetstream: jest.fn().mockReturnValue(mockJetStream),
    };
    const dynamicModule = ConsumerModule.forRoot({
      connection: mockConnection as NatsConnection,
    });
    expect(mockConnection.jetstream).toHaveBeenCalledTimes(1);
    expect(dynamicModule.exports).toContain(ConsumerService);
    expect(dynamicModule.exports).toContain(JetStreamConsumerService);
    expect(dynamicModule.exports).toContain(OnEventExplorer);
    expect(dynamicModule.exports).toContain(RequestReplyConsumerService);
    expect(dynamicModule.exports).toContain(OnRequestReplyExplorer);
    expect(dynamicModule.imports).toContain(DiscoveryModule);
  });

  it('should use provided jetStream directly via forRoot', () => {
    const dynamicModule = ConsumerModule.forRoot({
      jetStream: mockJetStream,
    });
    expect(dynamicModule.exports).toContain(ConsumerService);
    expect(dynamicModule.exports).toContain(JetStreamConsumerService);
    expect(dynamicModule.exports).toContain(OnEventExplorer);
    expect(dynamicModule.exports).toContain(RequestReplyConsumerService);
    expect(dynamicModule.exports).toContain(OnRequestReplyExplorer);
  });

  it('should throw if neither connection nor jetStream is provided', () => {
    expect(() => ConsumerModule.forRoot({})).toThrow(
      'ConsumerModule requires either connection or jetStream in options',
    );
  });

  it('should provide custom dlqSubjectBuilder via forRoot', () => {
    const customBuilder = (subject: string) => `custom-dlq.${subject}`;
    const dynamicModule = ConsumerModule.forRoot({
      jetStream: mockJetStream,
      dlqSubjectBuilder: customBuilder,
    });

    const depsProvider = dynamicModule.providers?.find(
      (p) => 'provide' in p && p.provide === JETSTREAM_CONSUMER_DEPS_TOKEN,
    ) as { provide: string; useFactory: (...args: unknown[]) => unknown };
    expect(depsProvider).toBeDefined();
  });

  it('should provide RequestReplyConsumerService and OnRequestReplyExplorer via forRoot', () => {
    const dynamicModule = ConsumerModule.forRoot({
      jetStream: mockJetStream,
    });
    expect(dynamicModule.providers).toContain(RequestReplyConsumerService);
    expect(dynamicModule.providers).toContain(OnRequestReplyExplorer);
  });

  it('should forward responseSubjectPattern to request reply consumer deps via forRoot', () => {
    const dynamicModule = ConsumerModule.forRoot({
      jetStream: mockJetStream,
      responseSubjectPattern: 'custom.response.v1',
    });

    const depsProvider = dynamicModule.providers?.find(
      (p) => 'provide' in p && p.provide === REQUEST_REPLY_CONSUMER_DEPS_TOKEN,
    ) as { provide: string; useFactory: (...args: unknown[]) => unknown; inject: unknown[] };
    expect(depsProvider).toBeDefined();
    expect(depsProvider.inject).toContain(EventLoggerService);

    const result = depsProvider.useFactory(mockLogger) as Record<string, unknown>;
    expect(result.responseSubjectPattern).toBe('custom.response.v1');
  });

  it('should resolve JetStream from async factory via forRootAsync', async () => {
    const dynamicModule = ConsumerModule.forRootAsync({
      useFactory: async () => ({ jetStream: mockJetStream }),
    });

    const optionsProvider = dynamicModule.providers?.find(
      (p) => 'provide' in p && p.provide === CONSUMER_MODULE_OPTIONS,
    ) as { useFactory: () => Promise<unknown> };
    const resolvedOptions = await optionsProvider.useFactory();
    expect(resolvedOptions).toEqual({ jetStream: mockJetStream });
  });

  it('should include DiscoveryModule in imports for forRootAsync', () => {
    const dynamicModule = ConsumerModule.forRootAsync({
      imports: [] as Array<never>,
      useFactory: async () => ({ jetStream: mockJetStream }),
    });
    expect(dynamicModule.imports).toContain(DiscoveryModule);
  });

  it('should provide RequestReplyConsumerService and OnRequestReplyExplorer via forRootAsync', () => {
    const dynamicModule = ConsumerModule.forRootAsync({
      useFactory: async () => ({ jetStream: mockJetStream }),
    });
    expect(dynamicModule.exports).toContain(RequestReplyConsumerService);
    expect(dynamicModule.exports).toContain(OnRequestReplyExplorer);
  });

  it('should invoke useFactory only once in forRootAsync', async () => {
    let factoryCallCount = 0;
    const dynamicModule = ConsumerModule.forRootAsync({
      useFactory: async () => {
        factoryCallCount++;
        return { jetStream: mockJetStream };
      },
    });

    const optionsProvider = dynamicModule.providers?.find(
      (p) => 'provide' in p && p.provide === CONSUMER_MODULE_OPTIONS,
    ) as { useFactory: () => Promise<unknown> };
    await optionsProvider.useFactory();
    expect(factoryCallCount).toBe(1);
  });

  it('should forward responseSubjectPattern via forRootAsync deps factory', () => {
    const dynamicModule = ConsumerModule.forRootAsync({
      useFactory: async () => ({
        jetStream: mockJetStream,
        responseSubjectPattern: 'async.response.v1',
      }),
    });

    const depsProvider = dynamicModule.providers?.find(
      (p) => 'provide' in p && p.provide === REQUEST_REPLY_CONSUMER_DEPS_TOKEN,
    ) as {
      provide: string;
      useFactory: (...args: unknown[]) => unknown;
      inject: unknown[];
    };
    expect(depsProvider).toBeDefined();

    const result = depsProvider.useFactory({ jetStream: mockJetStream }, mockLogger, {
      responseSubjectPattern: 'async.response.v1',
    }) as Record<string, unknown>;
    expect(result.responseSubjectPattern).toBe('async.response.v1');
  });

  describe('autoCreateStreams', () => {
    it('should forward autoCreateStreams flag to JetStream consumer deps via forRoot', () => {
      const dynamicModule = ConsumerModule.forRoot({
        jetStream: mockJetStream,
        autoCreateStreams: true,
      });

      const depsProvider = dynamicModule.providers?.find(
        (p) => 'provide' in p && p.provide === JETSTREAM_CONSUMER_DEPS_TOKEN,
      ) as { provide: string; useFactory: (...args: unknown[]) => Record<string, unknown> };
      expect(depsProvider).toBeDefined();

      const mockCS = {} as ConsumerService;
      const result = depsProvider.useFactory(mockCS, mockLogger);
      expect(result.autoCreateStreams).toBe(true);
    });

    it('should forward connection to JetStream consumer deps via forRoot', () => {
      const mockConnection = { jetstream: jest.fn().mockReturnValue(mockJetStream) } as unknown as NatsConnection;
      const dynamicModule = ConsumerModule.forRoot({
        connection: mockConnection,
        autoCreateStreams: true,
      });

      const depsProvider = dynamicModule.providers?.find(
        (p) => 'provide' in p && p.provide === JETSTREAM_CONSUMER_DEPS_TOKEN,
      ) as { provide: string; useFactory: (...args: unknown[]) => Record<string, unknown> };
      expect(depsProvider).toBeDefined();

      const mockCS = {} as ConsumerService;
      const result = depsProvider.useFactory(mockCS, mockLogger);
      expect(result.connection).toBe(mockConnection);
      expect(result.autoCreateStreams).toBe(true);
    });

    it('should surface autoCreateStreams from ConsumerModuleOptions via forRootAsync', async () => {
      const dynamicModule = ConsumerModule.forRootAsync({
        useFactory: async () => ({
          jetStream: mockJetStream,
          autoCreateStreams: true,
        }),
      });

      const depsProvider = dynamicModule.providers?.find(
        (p) => 'provide' in p && p.provide === JETSTREAM_CONSUMER_DEPS_TOKEN,
      ) as { provide: string; useFactory: (...args: unknown[]) => Record<string, unknown>; inject: unknown[] };
      expect(depsProvider).toBeDefined();

      const mockCS = {} as ConsumerService;
      const mockPair = { consumerService: mockCS, logger: mockLogger };
      const resolvedConnection = { jetStream: mockJetStream, connection: undefined };
      const moduleOptions = { jetStream: mockJetStream, autoCreateStreams: true };

      const result = depsProvider.useFactory(resolvedConnection, mockPair, moduleOptions);
      expect(result.autoCreateStreams).toBe(true);
    });
  });
});
