/**
 * End-to-end DI compilation regression test for `EventsToolkitModule.forRootAsync`.
 *
 * Compiles the full module graph with mocked NATS and SQLite outbox, then resolves
 * all core services to verify that every sub-module exports its providers correctly.
 * Catches missing-import and missing-export regressions across the entire toolkit boundary.
 */
import 'reflect-metadata';
import { Test, TestingModule } from '@nestjs/testing';
import { EventsToolkitModule } from './events-toolkit.module';
import { EventsToolkitModuleAsyncOptions } from './events-toolkit-options.interface';
import { ProducerService } from './producer/producer.service';
import { ConsumerService } from './consumer/consumer.service';
import { OutboxService } from './outbox/outbox.service';
import { DiscoveryService } from './discovery/discovery.service';
import { RequestReplyService } from './request-reply/request-reply.service';
import { RequestReplyConsumerService } from './consumer/request-reply-consumer.service';

jest.mock('nats', () => ({
  connect: jest.fn().mockResolvedValue({
    jetstream: jest.fn().mockReturnValue({
      publish: jest.fn(),
      subscribe: jest.fn(),
    }),
    request: jest.fn(),
    close: jest.fn(),
  }),
}));

jest.mock('./outbox/sqlite-outbox.repository', () => ({
  SqliteOutboxRepository: jest.fn().mockImplementation(() => ({
    save: jest.fn(),
    getPending: jest.fn().mockResolvedValue([]),
    markAsSent: jest.fn(),
    markAsFailed: jest.fn(),
  })),
}));

function buildForRootAsyncOptions(): EventsToolkitModuleAsyncOptions {
  return {
    useFactory: async () => ({
      nats: { servers: ['nats://localhost:4222'] },
      consumer: { enable: true },
      outbox: { type: 'sqlite' as const },
      discovery: { enabled: true, registerOnStartup: false },
    }),
  };
}

async function compileToolkitModule(): Promise<TestingModule> {
  return Test.createTestingModule({
    imports: [EventsToolkitModule.forRootAsync(buildForRootAsyncOptions())],
  }).compile();
}

describe('EventsToolkitModule.forRootAsync e2e DI compilation', () => {
  let moduleRef: TestingModule;

  beforeEach(async () => {
    moduleRef = await compileToolkitModule();
  });

  afterEach(async () => {
    if (moduleRef) {
      await moduleRef.close();
    }
  });

  it('compiles the full toolkit graph without external core providers', () => {
    expect(moduleRef).toBeDefined();
  });

  const resolvableServices = [
    ProducerService,
    ConsumerService,
    OutboxService,
    DiscoveryService,
    RequestReplyService,
    RequestReplyConsumerService,
  ] as const;

  it.each(resolvableServices.map((ServiceClass) => ({ ServiceClass, name: ServiceClass.name })))(
    'resolves $name from the compiled module',
    ({ ServiceClass }) => {
      expect(moduleRef.get(ServiceClass)).toBeInstanceOf(ServiceClass);
    },
  );
});
