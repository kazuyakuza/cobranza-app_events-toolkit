import { DynamicModule } from '@nestjs/common';
import { JetStreamClient, NatsConnection } from 'nats';
import { EventsToolkitModule } from './events-toolkit.module';
import { JETSTREAM_TOKEN } from './producer/producer.module';
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

function findProvider(providers: Provider[] | undefined, token: unknown): Provider | undefined {
  return providers?.find((p): p is Provider & { provide: unknown } => 'provide' in p && p.provide === token);
}

type Provider = Record<string, unknown>;

describe('EventsToolkitModule', () => {
  describe('forRoot', () => {
    it('should expose sub-module services via global imports instead of exports', async () => {
      const module = await EventsToolkitModule.forRoot({
        nats: { connection: { jetstream: () => mockJetStream } as unknown as NatsConnection },
      });
      const importNames = (module.imports ?? []).map((m) => (m as { module?: { name?: string } }).module?.name);
      expect(importNames.some(n => n === 'ProducerModule')).toBe(true);
      expect(importNames.some(n => n === 'ConsumerModule')).toBe(true);
      expect(importNames.some(n => n === 'DiscoveryModule')).toBe(true);
      expect(module.exports ?? []).toHaveLength(0);
    });

    it('should be a global module', async () => {
      const module = await EventsToolkitModule.forRoot({
        nats: { connection: { jetstream: () => mockJetStream } as unknown as NatsConnection },
      });
      expect(module.global).toBe(true);
    });

    it('should include ConsumerModule when consumer not disabled', async () => {
      const module = await EventsToolkitModule.forRoot({
        nats: { connection: { jetstream: () => mockJetStream } as unknown as NatsConnection },
      });
      const moduleNames = (module.imports ?? []).map((m) => (m as { module?: { name?: string } }).module?.name);
      expect(moduleNames.length).toBeGreaterThanOrEqual(2);
    });

    it('should skip ConsumerModule when consumer.enable is false', async () => {
      const module = await EventsToolkitModule.forRoot({
        nats: { connection: { jetstream: () => mockJetStream } as unknown as NatsConnection },
        consumer: { enable: false },
      });
      const consumerImport = (module.imports ?? []).find(
        (m) => (m as { module?: { name?: string } }).module?.name === 'ConsumerModule',
      );
      expect(consumerImport).toBeUndefined();
    });

    it('should include OutboxModule when outbox is configured', async () => {
      const module = await EventsToolkitModule.forRoot({
        nats: { connection: { jetstream: () => mockJetStream } as unknown as NatsConnection },
        outbox: { type: 'sqlite' },
      });
      const moduleNames = (module.imports ?? []).map((m) => (m as { module?: { name?: string } }).module?.name);
      expect(moduleNames.some((n) => n === 'OutboxModule')).toBe(true);
    });

    it('should not include OutboxModule when outbox is not configured', async () => {
      const module = await EventsToolkitModule.forRoot({
        nats: { connection: { jetstream: () => mockJetStream } as unknown as NatsConnection },
      });
      const outboxImport = (module.imports ?? []).find(
        (m) => (m as { module?: { name?: string } }).module?.name === 'OutboxModule',
      );
      expect(outboxImport).toBeUndefined();
    });

    it('should provide EventLoggerService with default config', async () => {
      const module = await EventsToolkitModule.forRoot({
        nats: { connection: { jetstream: () => mockJetStream } as unknown as NatsConnection },
      });
      const loggerProvider = findProvider(module.providers as Provider[] | undefined, EventLoggerService);
      expect(loggerProvider).toBeDefined();
    });

    it('should provide EventLoggerService with custom logging config', async () => {
      const module = await EventsToolkitModule.forRoot({
        nats: { connection: { jetstream: () => mockJetStream } as unknown as NatsConnection },
        logging: { level: 'debug' },
      });
      const loggerProvider = findProvider(module.providers as Provider[] | undefined, EventLoggerService) as Provider;
      expect(loggerProvider).toBeDefined();
      expect((loggerProvider as { useValue: EventLoggerService }).useValue).toBeInstanceOf(EventLoggerService);
    });
  });

  describe('forRootAsync', () => {
    it('should expose sub-module services via global imports instead of exports', () => {
      const module = EventsToolkitModule.forRootAsync({
        useFactory: async () => ({ nats: { servers: ['nats://localhost:4222'] } }),
      });
      const importNames = (module.imports ?? []).map((m) => (m as { module?: { name?: string } }).module?.name);
      expect(importNames.some(n => n === 'ProducerModule')).toBe(true);
      expect(importNames.some(n => n === 'ConsumerModule')).toBe(true);
      expect(importNames.some(n => n === 'OutboxModule')).toBe(true);
      expect(module.exports ?? []).toHaveLength(0);
    });

    it('should be a global module', () => {
      const module = EventsToolkitModule.forRootAsync({
        useFactory: async () => ({ nats: { servers: ['nats://localhost:4222'] } }),
      });
      expect(module.global).toBe(true);
    });

    it('should provide JETSTREAM_TOKEN from single source', () => {
      const module = EventsToolkitModule.forRootAsync({
        useFactory: async () => ({ nats: { servers: ['nats://localhost:4222'] } }),
      });
      const jsProvider = findProvider(module.providers as Provider[] | undefined, JETSTREAM_TOKEN);
      expect(jsProvider).toBeDefined();
    });

    it('should provide EVENTS_TOOLKIT_OPTIONS from factory', () => {
      const module = EventsToolkitModule.forRootAsync({
        useFactory: async () => ({ nats: { servers: ['nats://localhost:4222'] } }),
      });
      const optsProvider = findProvider(module.providers as Provider[] | undefined, 'EVENTS_TOOLKIT_OPTIONS');
      expect(optsProvider).toBeDefined();
    });

    it('should include ProducerModule, ConsumerModule, and OutboxModule in imports', () => {
      const module = EventsToolkitModule.forRootAsync({
        useFactory: async () => ({ nats: { servers: ['nats://localhost:4222'] } }),
      });
      expect(module.imports?.length).toBeGreaterThanOrEqual(3);
    });

    it('should include user-provided imports', () => {
      const dummyModule = { module: class DummyModule {} };
      const module = EventsToolkitModule.forRootAsync({
        useFactory: async () => ({ nats: { servers: ['nats://localhost:4222'] } }),
        imports: [dummyModule],
      });
      expect(module.imports).toContain(dummyModule);
    });

    it('should provide async logging from EVENTS_TOOLKIT_OPTIONS', () => {
      const module = EventsToolkitModule.forRootAsync({
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
      const module = EventsToolkitModule.forRootAsync({
        useFactory: async () => ({ nats: { servers: ['nats://localhost:4222'] } }),
      });
      const producerImport = module.imports?.find(
        (m) => (m as { module?: { name?: string } }).module?.name === 'ProducerModule',
      );
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
      await EventsToolkitModule.forRoot({
        nats: { servers: ['nats://localhost:4222'] },
      });
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
      await EventsToolkitModule.forRoot({
        nats: { connection: userConn },
      });
      const instance = new EventsToolkitModule();
      instance.onModuleDestroy();
      expect(mockClose).not.toHaveBeenCalled();
    });
  });
});
