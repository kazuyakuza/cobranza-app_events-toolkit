import 'reflect-metadata';
import { Module, Global } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DiscoveryService, Reflector, MetadataScanner } from '@nestjs/core';
import { EventsToolkitModule } from './events-toolkit.module';
import { ProducerService } from './producer/producer.service';
import { ConsumerService } from './consumer/consumer.service';
import { OutboxService } from './outbox/outbox.service';
import { EventLoggerService } from './logging/event-logger.service';

jest.mock('nats', () => ({
  connect: jest.fn().mockResolvedValue({
    jetstream: jest.fn().mockReturnValue({
      publish: jest.fn(),
      subscribe: jest.fn(),
    }),
    close: jest.fn(),
  }),
  AckPolicy: { Explicit: 0 },
}));

jest.mock('./outbox/sqlite-outbox.repository', () => {
  const mockRepo = {
    save: jest.fn(),
    getPending: jest.fn().mockResolvedValue([]),
    markAsSent: jest.fn(),
    markAsFailed: jest.fn(),
  };
  return {
    SqliteOutboxRepository: jest.fn().mockImplementation(() => mockRepo),
  };
});

@Global()
@Module({
  providers: [
    {
      provide: DiscoveryService,
      useValue: {
        getProviders: jest.fn().mockReturnValue([]),
        getControllers: jest.fn().mockReturnValue([]),
      } as unknown as DiscoveryService,
    },
    { provide: Reflector, useValue: new Reflector() },
    { provide: MetadataScanner, useValue: { scanFromPrototype: jest.fn() } },
  ],
  exports: [DiscoveryService, Reflector, MetadataScanner],
})
class GlobalCoreModule {}

const forRootAsyncOptions = {
  useFactory: async () => ({
    nats: { servers: ['nats://localhost:4222'] },
  }),
};

async function compileToolkit(): Promise<TestingModule> {
  return Test.createTestingModule({
    imports: [GlobalCoreModule, EventsToolkitModule.forRootAsync(forRootAsyncOptions)],
  }).compile();
}

describe('EventsToolkitModule.forRootAsync DI compilation (exports regression)', () => {
  let moduleRef: TestingModule;

  afterEach(async () => {
    if (moduleRef) {
      await moduleRef.close();
    }
  });

  it('compiles and resolves ProducerService (depends on exported JETSTREAM_TOKEN)', async () => {
    moduleRef = await compileToolkit();

    expect(moduleRef.get(ProducerService)).toBeInstanceOf(ProducerService);
  });

  it('compiles and resolves ConsumerService and OutboxService (depend on exported token chain)', async () => {
    moduleRef = await compileToolkit();

    expect(moduleRef.get(ConsumerService)).toBeInstanceOf(ConsumerService);
    expect(moduleRef.get(OutboxService)).toBeInstanceOf(OutboxService);
  });

  it('exposes the toolkit-level EventLoggerService globally for consumer/outbox injection', async () => {
    moduleRef = await compileToolkit();

    expect(moduleRef.get(EventLoggerService)).toBeInstanceOf(EventLoggerService);
  });
});
