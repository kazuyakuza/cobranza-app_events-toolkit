import 'reflect-metadata';
import { Test, TestingModule } from '@nestjs/testing';
import { Global, Module } from '@nestjs/common';
import { DiscoveryService, Reflector, MetadataScanner } from '@nestjs/core';
import { JetStreamClient } from 'nats';
import { ConsumerModule } from './consumer/consumer.module';
import { ConsumerService } from './consumer/consumer.service';
import { OutboxModule } from './outbox/outbox.module';
import { OutboxService } from './outbox/outbox.service';
import { DiscoveryModule } from './discovery/discovery.module';
import { DiscoveryService as AppDiscoveryService } from './discovery/discovery.service';
import { ProducerService } from './producer/producer.service';
import { EventLoggerService } from './logging/event-logger.service';

jest.mock('./outbox/sqlite-outbox.repository', () => ({
  SqliteOutboxRepository: jest.fn().mockImplementation(() => ({
    save: jest.fn(),
    getPending: jest.fn().mockResolvedValue([]),
    markAsSent: jest.fn(),
    markAsFailed: jest.fn(),
  })),
}));

const mockJetStream = { publish: jest.fn(), subscribe: jest.fn() } as unknown as JetStreamClient;

@Global()
@Module({
  providers: [
    { provide: EventLoggerService, useValue: { logEventEmitted: jest.fn() } as unknown as EventLoggerService },
  ],
  exports: [EventLoggerService],
})
class GlobalLoggerModule {}

@Global()
@Module({
  providers: [
    { provide: ProducerService, useValue: { emit: jest.fn(), publish: jest.fn() } as unknown as ProducerService },
  ],
  exports: [ProducerService],
})
class GlobalProducerMockModule {}

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

async function compileWithGlobals(
  imports: Parameters<typeof Test.createTestingModule>[0]['imports'],
): Promise<TestingModule> {
  return Test.createTestingModule({ imports }).compile();
}

describe('Module DI compilation (circular-dependency regression)', () => {
  let moduleRef: TestingModule;

  afterEach(async () => {
    if (moduleRef) {
      await moduleRef.close();
    }
  });

  it('ConsumerModule compiles forRoot and resolves ConsumerService', async () => {
    moduleRef = await compileWithGlobals([GlobalLoggerModule, ConsumerModule.forRoot({ jetStream: mockJetStream })]);

    expect(moduleRef.get(ConsumerService)).toBeInstanceOf(ConsumerService);
  });

  it('OutboxModule compiles forRoot and resolves OutboxService', async () => {
    moduleRef = await compileWithGlobals([
      GlobalLoggerModule,
      GlobalProducerMockModule,
      OutboxModule.forRoot({ type: 'sqlite', sqlite: { dbPath: ':memory:' } }),
    ]);

    expect(moduleRef.get(OutboxService)).toBeInstanceOf(OutboxService);
  });

  it('DiscoveryModule compiles forRoot with enabled:false and resolves AppDiscoveryService', async () => {
    moduleRef = await compileWithGlobals([GlobalCoreModule, DiscoveryModule.forRoot({ enabled: false })]);

    expect(moduleRef.get(AppDiscoveryService)).toBeInstanceOf(AppDiscoveryService);
  });
});
