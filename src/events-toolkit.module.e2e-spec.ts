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

/**
 * NATS connection mock.
 *
 * `request` is included because `RequestReplyService` stores a reference to it
 * during instantiation. Even though no test in this file invokes `request`
 * directly, omitting it would cause DI compilation to fail when the service's
 * constructor tries to access `natsConnection.request`.
 *
 * AI AGENT NOTE: If a new service is added that depends on additional NATS
 * connection methods (e.g., `subscribe`, `jetstreamManager`), add stubs for
 * those methods here to prevent DI compilation failures.
 */
jest.mock('nats', () => ({
  connect: jest.fn().mockResolvedValue({
    jetstream: jest.fn().mockReturnValue({
      publish: jest.fn(),
      subscribe: jest.fn(),
    }),
    jetstreamManager: jest.fn().mockResolvedValue({ streams: { find: jest.fn(), add: jest.fn() } }),
    request: jest.fn(),
    close: jest.fn(),
  }),
  AckPolicy: { Explicit: 'Explicit', All: 'All', None: 'None' },
  RetentionPolicy: { Limits: 'Limits', Interest: 'Interest', WorkQueue: 'WorkQueue' },
  StorageType: { File: 'File', Memory: 'Memory' },
  consumerOpts: () => ({
    manualAck: () => ({ ackExplicit: () => ({ getOpts: () => ({ config: { ack_policy: 'Explicit' } }) }) }),
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

  /**
   * Registry of every core service that the toolkit module must provide.
   *
   * PURPOSE: Acts as a regression guard — if a sub-module stops exporting a
   * provider, the corresponding entry here will fail to resolve and the test
   * will surface the missing export immediately.
   *
   * WHY `it.each`: Each service is tested in an independent test case so that
   * a failure in one does not mask failures in others. Adding a new core
   * service requires appending it to this array; otherwise the new service
   * will not be covered by the regression guard.
   *
   * AI AGENT NOTE: When introducing a new injectable service in any sub-module,
   * add its class to this array to ensure it is verified during DI compilation.
   */
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
