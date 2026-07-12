import { DynamicModule } from '@nestjs/common';
import { JetStreamClient, NatsConnection } from 'nats';
import { EventsToolkitModule } from './events-toolkit.module';
import { JETSTREAM_TOKEN } from './producer/producer.constants';
import { EventLoggerService } from './logging/event-logger.service';

jest.mock('nats', () => ({
  connect: jest.fn().mockResolvedValue({
    jetstream: jest.fn().mockReturnValue({ publish: jest.fn(), subscribe: jest.fn() }),
    close: jest.fn(),
  }),
}));

jest.mock('./outbox/sqlite-outbox.repository', () => {
  const mockRepo = {
    save: jest.fn(),
    getPending: jest.fn(),
    markAsSent: jest.fn(),
    markAsFailed: jest.fn(),
  };
  return {
    SqliteOutboxRepository: jest.fn().mockImplementation(() => mockRepo),
  };
});

const mockJetStream = { publish: jest.fn(), subscribe: jest.fn() } as unknown as JetStreamClient;

const forRootOptions = {
  nats: { connection: { jetstream: () => mockJetStream } as unknown as NatsConnection },
};

const forRootAsyncOptions = {
  useFactory: async () => ({ nats: { servers: ['nats://localhost:4222'] } }),
};

function getModuleName(imported: unknown): string | undefined {
  return (imported as { module?: { name?: string } }).module?.name;
}

function findProvider(providers: Provider[] | undefined, token: unknown): Provider | undefined {
  return providers?.find((p): p is Provider & { provide: unknown } => 'provide' in p && p.provide === token);
}

type Provider = Record<string, unknown>;

describe('EventsToolkitModule', () => {
  describe('forRoot', () => {
    it('should expose sub-module services via global imports instead of exports', async () => {
      const module = await EventsToolkitModule.forRoot(forRootOptions);
      const importNames = (module.imports ?? []).map(getModuleName);
      expect(importNames).toContain('ProducerModule');
      expect(importNames).toContain('ConsumerModule');
      expect(importNames).toContain('DiscoveryModule');
      expect(module.exports ?? []).toHaveLength(0);
    });

    it('should be a global module', async () => {
      const module = await EventsToolkitModule.forRoot(forRootOptions);
      expect(module.global).toBe(true);
    });

    it('should include ConsumerModule when consumer not disabled', async () => {
      const module = await EventsToolkitModule.forRoot(forRootOptions);
      const moduleNames = (module.imports ?? []).map(getModuleName);
      expect(moduleNames.length).toBeGreaterThanOrEqual(2);
    });

    it('should skip ConsumerModule when consumer.enable is false', async () => {
      const module = await EventsToolkitModule.forRoot({
        ...forRootOptions,
        consumer: { enable: false },
      });
      const consumerNames = (module.imports ?? []).map(getModuleName).filter((n) => n === 'ConsumerModule');
      expect(consumerNames).toHaveLength(0);
    });

    it('should include OutboxModule when outbox is configured', async () => {
      const module = await EventsToolkitModule.forRoot({
        ...forRootOptions,
        outbox: { type: 'sqlite' },
      });
      const moduleNames = (module.imports ?? []).map(getModuleName);
      expect(moduleNames).toContain('OutboxModule');
    });

    it('should not include OutboxModule when outbox is not configured', async () => {
      const module = await EventsToolkitModule.forRoot(forRootOptions);
      const outboxNames = (module.imports ?? []).map(getModuleName).filter((n) => n === 'OutboxModule');
      expect(outboxNames).toHaveLength(0);
    });

    it('should provide EventLoggerService with default config', async () => {
      const module = await EventsToolkitModule.forRoot(forRootOptions);
      const loggerProvider = findProvider(module.providers as Provider[] | undefined, EventLoggerService);
      expect(loggerProvider).toBeDefined();
    });

    it('should provide EventLoggerService with custom logging config', async () => {
      const module = await EventsToolkitModule.forRoot({
        ...forRootOptions,
        logging: { level: 'debug' },
      });
      const loggerProvider = findProvider(module.providers as Provider[] | undefined, EventLoggerService) as Provider;
      expect(loggerProvider).toBeDefined();
      expect((loggerProvider as { useValue: EventLoggerService }).useValue).toBeInstanceOf(EventLoggerService);
    });
  });

  describe('forRootAsync', () => {
    it('should expose sub-module services via global imports instead of exports', () => {
      const module = EventsToolkitModule.forRootAsync(forRootAsyncOptions);
      const importNames = (module.imports ?? []).map(getModuleName);
      expect(importNames).toContain('ProducerModule');
      expect(importNames).toContain('ConsumerModule');
      expect(importNames).toContain('OutboxModule');
      expect(module.exports ?? []).toHaveLength(0);
    });

    it('should be a global module', () => {
      const module = EventsToolkitModule.forRootAsync(forRootAsyncOptions);
      expect(module.global).toBe(true);
    });

    it('should provide JETSTREAM_TOKEN from single source', () => {
      const module = EventsToolkitModule.forRootAsync(forRootAsyncOptions);
      const jsProvider = findProvider(module.providers as Provider[] | undefined, JETSTREAM_TOKEN);
      expect(jsProvider).toBeDefined();
    });

    it('should provide EVENTS_TOOLKIT_OPTIONS from factory', () => {
      const module = EventsToolkitModule.forRootAsync(forRootAsyncOptions);
      const optsProvider = findProvider(module.providers as Provider[] | undefined, 'EVENTS_TOOLKIT_OPTIONS');
      expect(optsProvider).toBeDefined();
    });

    it('should include ProducerModule, ConsumerModule, and OutboxModule in imports', () => {
      const module = EventsToolkitModule.forRootAsync(forRootAsyncOptions);
      expect(module.imports?.length).toBeGreaterThanOrEqual(3);
    });

    it('should include user-provided imports', () => {
      const dummyModule = { module: class DummyModule {} };
      const module = EventsToolkitModule.forRootAsync({
        ...forRootAsyncOptions,
        imports: [dummyModule],
      });
      expect(module.imports).toContain(dummyModule);
    });

    it('should provide async logging from EVENTS_TOOLKIT_OPTIONS', () => {
      const module = EventsToolkitModule.forRootAsync({
        ...forRootAsyncOptions,
        useFactory: async () => ({
          nats: { servers: ['nats://localhost:4222'] },
          logging: { level: 'debug' },
        }),
      });
      const loggerProvider = findProvider(module.providers as Provider[] | undefined, EventLoggerService) as Provider;
      expect(loggerProvider).toBeDefined();
      expect('useFactory' in loggerProvider).toBe(true);
    });

    it('should use ProducerModule with useExisting for JETSTREAM_TOKEN', () => {
      const module = EventsToolkitModule.forRootAsync(forRootAsyncOptions);
      const producerImport = module.imports?.find((m) => getModuleName(m) === 'ProducerModule');
      expect(producerImport).toBeDefined();
      const producerProviders = (producerImport as DynamicModule | undefined)?.providers ?? [];
      const hasJetStreamProvider = producerProviders.some(
        (p) =>
          'provide' in (p as unknown as Record<string, unknown>) &&
          (p as unknown as Record<string, unknown>).provide === JETSTREAM_TOKEN,
      );
      expect(hasJetStreamProvider).toBe(false);
    });
  });

  describe('onModuleDestroy', () => {
    it('should close owned NATS connection on destroy', async () => {
      const { connect } = jest.requireMock('nats') as { connect: jest.Mock };
      const mockClose = jest.fn();
      connect.mockResolvedValueOnce({
        jetstream: jest.fn().mockReturnValue(mockJetStream),
        close: mockClose,
      });
      await EventsToolkitModule.forRoot({ nats: { servers: ['nats://localhost:4222'] } });
      const instance = new EventsToolkitModule();
      instance.onModuleDestroy();
      expect(mockClose).toHaveBeenCalled();
    });

    it('should not close user-provided NATS connection', async () => {
      const mockClose = jest.fn();
      const userConn = {
        jetstream: () => mockJetStream,
        close: mockClose,
      } as unknown as NatsConnection;
      await EventsToolkitModule.forRoot({ nats: { connection: userConn } });
      const instance = new EventsToolkitModule();
      instance.onModuleDestroy();
      expect(mockClose).not.toHaveBeenCalled();
    });
  });
});
