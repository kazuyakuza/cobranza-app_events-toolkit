import { DynamicModule } from '@nestjs/common';
import { JetStreamClient, NatsConnection } from 'nats';
import { EventsToolkitModule } from './events-toolkit.module';
import { EventLoggerService } from './logging/event-logger.service';
import { RequestReplyService } from './request-reply/request-reply.service';
import { REQUEST_REPLY_DEPS_TOKEN } from './request-reply/request-reply.types';

jest.mock('nats', () => ({
  connect: jest.fn().mockResolvedValue({
    jetstream: jest.fn().mockReturnValue({ publish: jest.fn(), subscribe: jest.fn() }),
    close: jest.fn(),
  }),
  AckPolicy: { Explicit: 0 },
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

function getModuleName(imported: unknown): string | undefined {
  const dynamicModule = imported as DynamicModule | undefined;
  return dynamicModule?.module?.name;
}

function findProvider(providers: Provider[] | undefined, token: unknown): Provider | undefined {
  return providers?.find((p) => p === token || ('provide' in p && p.provide === token));
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
      expect(module.exports ?? []).toContain(RequestReplyService);
      expect(module.exports ?? []).toContain(REQUEST_REPLY_DEPS_TOKEN);
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

    it('should include IdempotencyModule when idempotency is configured and enabled', async () => {
      const module = await EventsToolkitModule.forRoot({
        ...forRootOptions,
        idempotency: { type: 'memory' },
      });
      const moduleNames = (module.imports ?? []).map(getModuleName);
      expect(moduleNames).toContain('IdempotencyModule');
    });

    it('should not include IdempotencyModule when idempotency is not configured', async () => {
      const module = await EventsToolkitModule.forRoot(forRootOptions);
      const idempNames = (module.imports ?? []).map(getModuleName).filter((n) => n === 'IdempotencyModule');
      expect(idempNames).toHaveLength(0);
    });

    it('should not include IdempotencyModule when idempotency.enabled is false', async () => {
      const module = await EventsToolkitModule.forRoot({
        ...forRootOptions,
        idempotency: { type: 'memory', enabled: false },
      });
      const idempNames = (module.imports ?? []).map(getModuleName).filter((n) => n === 'IdempotencyModule');
      expect(idempNames).toHaveLength(0);
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
