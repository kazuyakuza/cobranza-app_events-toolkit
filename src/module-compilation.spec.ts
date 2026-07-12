import 'reflect-metadata';
import { JetStreamClient } from 'nats';
import { ConsumerModule } from './consumer/consumer.module';
import { OutboxModule } from './outbox/outbox.module';
import { DiscoveryModule } from './discovery/discovery.module';

jest.mock('./outbox/sqlite-outbox.repository', () => {
  const mockRepo = {
    save: jest.fn(),
    getPending: jest.fn().mockResolvedValue([]),
    markAsSent: jest.fn(),
    markAsFailed: jest.fn(),
  };
  return { SqliteOutboxRepository: jest.fn().mockImplementation(() => mockRepo) };
});

describe('Module DI compilation (circular-dependency regression smoke)', () => {
  const mockJetStream = { publish: jest.fn(), subscribe: jest.fn() } as unknown as JetStreamClient;

  describe('ConsumerModule', () => {
    it('creates forRoot dynamic module without error', () => {
      const dynamicModule = ConsumerModule.forRoot({ jetStream: mockJetStream });
      expect(dynamicModule.module).toBe(ConsumerModule);
      expect(dynamicModule.providers?.length).toBeGreaterThan(0);
    });

    it('creates forRootAsync dynamic module without error', () => {
      const dynamicModule = ConsumerModule.forRootAsync({
        useFactory: async () => ({ jetStream: mockJetStream }),
      });
      expect(dynamicModule.module).toBe(ConsumerModule);
      expect(dynamicModule.providers?.length).toBeGreaterThan(0);
    });
  });

  describe('OutboxModule', () => {
    it('creates forRoot dynamic module without error', () => {
      const dynamicModule = OutboxModule.forRoot({ type: 'sqlite', sqlite: { dbPath: ':memory:' } });
      expect(dynamicModule.module).toBe(OutboxModule);
      expect(dynamicModule.providers?.length).toBeGreaterThan(0);
    });

    it('creates forRootAsync dynamic module without error', () => {
      const dynamicModule = OutboxModule.forRootAsync({
        useFactory: async () => ({ type: 'sqlite', sqlite: { dbPath: ':memory:' } }),
      });
      expect(dynamicModule.module).toBe(OutboxModule);
      expect(dynamicModule.providers?.length).toBeGreaterThan(0);
    });
  });

  describe('DiscoveryModule', () => {
    it('creates forRoot dynamic module without error', () => {
      const dynamicModule = DiscoveryModule.forRoot({ enabled: false });
      expect(dynamicModule.module).toBe(DiscoveryModule);
      expect(dynamicModule.providers?.length).toBeGreaterThan(0);
    });

    it('creates forRootAsync dynamic module without error', () => {
      const dynamicModule = DiscoveryModule.forRootAsync({
        useFactory: async () => ({ enabled: false }),
      });
      expect(dynamicModule.module).toBe(DiscoveryModule);
      expect(dynamicModule.providers?.length).toBeGreaterThan(0);
    });
  });
});
