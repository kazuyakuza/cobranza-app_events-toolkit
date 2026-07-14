import 'reflect-metadata';
import { Test, TestingModule } from '@nestjs/testing';
import { EventsToolkitModule } from './events-toolkit.module';
import { EventsToolkitModuleAsyncOptions } from './events-toolkit-options.interface';
import { ProducerService } from './producer/producer.service';
import { ConsumerService } from './consumer/consumer.service';
import { OutboxService } from './outbox/outbox.service';
import { DiscoveryService } from './discovery/discovery.service';

jest.mock('nats', () => ({
  connect: jest.fn().mockResolvedValue({
    jetstream: jest.fn().mockReturnValue({
      publish: jest.fn(),
      subscribe: jest.fn(),
    }),
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

  afterEach(async () => {
    if (moduleRef) {
      await moduleRef.close();
    }
  });

  it('compiles the full toolkit graph without external core providers', async () => {
    moduleRef = await compileToolkitModule();

    expect(moduleRef).toBeDefined();
  });

  it('resolves ProducerService from the compiled module', async () => {
    moduleRef = await compileToolkitModule();

    expect(moduleRef.get(ProducerService)).toBeInstanceOf(ProducerService);
  });

  it('resolves ConsumerService from the compiled module', async () => {
    moduleRef = await compileToolkitModule();

    expect(moduleRef.get(ConsumerService)).toBeInstanceOf(ConsumerService);
  });

  it('resolves OutboxService from the compiled module', async () => {
    moduleRef = await compileToolkitModule();

    expect(moduleRef.get(OutboxService)).toBeInstanceOf(OutboxService);
  });

  it('resolves DiscoveryService via the fixed NestDiscoveryModule import', async () => {
    moduleRef = await compileToolkitModule();

    expect(moduleRef.get(DiscoveryService)).toBeInstanceOf(DiscoveryService);
  });
});
