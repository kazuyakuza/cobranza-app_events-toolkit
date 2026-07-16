import { EventLoggerService } from '../logging/event-logger.service';
import { JetStreamClient, NatsConnection } from 'nats';
import { ConsumerModule } from './consumer.module';
import { JETSTREAM_CONSUMER_DEPS_TOKEN } from './jetstream-consumer-deps.interface';
import { REQUEST_REPLY_CONSUMER_DEPS_TOKEN } from './request-reply-consumer-deps.interface';
import { ConsumerService } from './consumer.service';

describe('ConsumerModule — autoCreateStreams', () => {
  const mockJetStream = { publish: jest.fn(), subscribe: jest.fn() } as unknown as JetStreamClient;
  const mockLogger = {
    logEventConsumed: jest.fn(),
    logEventError: jest.fn(),
    logEventDlq: jest.fn(),
  } as unknown as EventLoggerService;

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
    const combined = {
      connection: { jetStream: mockJetStream, connection: undefined },
      moduleOptions: { jetStream: mockJetStream, autoCreateStreams: true },
    };

    const result = depsProvider.useFactory(combined, mockPair);
    expect(result.autoCreateStreams).toBe(true);
  });

  it('should forward streamConfig to JetStream consumer deps via forRoot', () => {
    const overrides = { max_bytes: 1000 };
    const dynamicModule = ConsumerModule.forRoot({
      jetStream: mockJetStream,
      autoCreateStreams: true,
      streamConfig: overrides,
    });

    const depsProvider = dynamicModule.providers?.find(
      (p) => 'provide' in p && p.provide === JETSTREAM_CONSUMER_DEPS_TOKEN,
    ) as { provide: string; useFactory: (...args: unknown[]) => Record<string, unknown> };
    expect(depsProvider).toBeDefined();

    const mockCS = {} as ConsumerService;
    const result = depsProvider.useFactory(mockCS, mockLogger);
    expect(result.streamConfig).toBe(overrides);
  });

  it('should forward streamConfig to Request-Reply consumer deps via forRoot', () => {
    const overrides = { max_bytes: 1000 };
    const dynamicModule = ConsumerModule.forRoot({
      jetStream: mockJetStream,
      responseSubjectPattern: 'custom.response.v1',
      streamConfig: overrides,
    });

    const depsProvider = dynamicModule.providers?.find(
      (p) => 'provide' in p && p.provide === REQUEST_REPLY_CONSUMER_DEPS_TOKEN,
    ) as { provide: string; useFactory: (...args: unknown[]) => Record<string, unknown> };
    expect(depsProvider).toBeDefined();

    const result = depsProvider.useFactory(mockLogger) as Record<string, unknown>;
    expect(result.streamConfig).toBe(overrides);
  });

  it('should surface streamConfig from ConsumerModuleOptions via forRootAsync', async () => {
    const overrides = { max_bytes: 1000 };
    const dynamicModule = ConsumerModule.forRootAsync({
      useFactory: async () => ({ jetStream: mockJetStream, streamConfig: overrides }),
    });

    const depsProvider = dynamicModule.providers?.find(
      (p) => 'provide' in p && p.provide === JETSTREAM_CONSUMER_DEPS_TOKEN,
    ) as { provide: string; useFactory: (...args: unknown[]) => Record<string, unknown>; inject: unknown[] };
    expect(depsProvider).toBeDefined();

    const mockCS = {} as ConsumerService;
    const mockPair = { consumerService: mockCS, logger: mockLogger };
    const combined = {
      connection: { jetStream: mockJetStream, connection: undefined },
      moduleOptions: { jetStream: mockJetStream, streamConfig: overrides },
    };

    const result = depsProvider.useFactory(combined, mockPair);
    expect(result.streamConfig).toBe(overrides);
  });
});
