import { JetStreamClient, NatsConnection } from 'nats';
import { DiscoveryModule } from '@nestjs/core';
import { ConsumerModule, CONSUMER_MODULE_OPTIONS } from './consumer.module';
import { JETSTREAM_CONSUMER_DEPS_TOKEN } from './jetstream-consumer-deps.interface';
import { ConsumerService } from './consumer.service';
import { JetStreamConsumerService } from './jetstream-consumer.service';
import { OnEventExplorer } from './decorators/on-event.explorer';

describe('ConsumerModule', () => {
  const mockJetStream = { publish: jest.fn(), subscribe: jest.fn() } as unknown as JetStreamClient;

  it('should resolve JetStream from connection via forRoot', () => {
    const mockConnection: Partial<NatsConnection> & { jetstream: jest.Mock } = {
      jetstream: jest.fn().mockReturnValue(mockJetStream),
    };
    const dynamicModule = ConsumerModule.forRoot({
      connection: mockConnection as NatsConnection,
    });
    expect(mockConnection.jetstream).toHaveBeenCalledTimes(1);
    expect(dynamicModule.exports).toContain(ConsumerService);
    expect(dynamicModule.exports).toContain(JetStreamConsumerService);
    expect(dynamicModule.exports).toContain(OnEventExplorer);
    expect(dynamicModule.imports).toContain(DiscoveryModule);
  });

  it('should use provided jetStream directly via forRoot', () => {
    const dynamicModule = ConsumerModule.forRoot({
      jetStream: mockJetStream,
    });
    expect(dynamicModule.exports).toContain(ConsumerService);
    expect(dynamicModule.exports).toContain(JetStreamConsumerService);
    expect(dynamicModule.exports).toContain(OnEventExplorer);
  });

  it('should throw if neither connection nor jetStream is provided', () => {
    expect(() => ConsumerModule.forRoot({})).toThrow(
      'ConsumerModule requires either connection or jetStream in options',
    );
  });

  it('should provide custom dlqSubjectBuilder via forRoot', () => {
    const customBuilder = (subject: string) => `custom-dlq.${subject}`;
    const dynamicModule = ConsumerModule.forRoot({
      jetStream: mockJetStream,
      dlqSubjectBuilder: customBuilder,
    });

    const depsProvider = dynamicModule.providers?.find(
      (p) => 'provide' in p && p.provide === JETSTREAM_CONSUMER_DEPS_TOKEN,
    ) as { provide: string; useFactory: (...args: unknown[]) => unknown };
    expect(depsProvider).toBeDefined();
  });

  it('should resolve JetStream from async factory via forRootAsync', async () => {
    const dynamicModule = ConsumerModule.forRootAsync({
      useFactory: async () => ({ jetStream: mockJetStream }),
    });

    const optionsProvider = dynamicModule.providers?.find(
      (p) => 'provide' in p && p.provide === CONSUMER_MODULE_OPTIONS,
    ) as { useFactory: () => Promise<unknown> };
    const resolvedOptions = await optionsProvider.useFactory();
    expect(resolvedOptions).toEqual({ jetStream: mockJetStream });
  });

  it('should include DiscoveryModule in imports for forRootAsync', () => {
    const dynamicModule = ConsumerModule.forRootAsync({
      imports: [] as Array<never>,
      useFactory: async () => ({ jetStream: mockJetStream }),
    });
    expect(dynamicModule.imports).toContain(DiscoveryModule);
  });

  it('should invoke useFactory only once in forRootAsync', async () => {
    let factoryCallCount = 0;
    const dynamicModule = ConsumerModule.forRootAsync({
      useFactory: async () => {
        factoryCallCount++;
        return { jetStream: mockJetStream };
      },
    });

    const optionsProvider = dynamicModule.providers?.find(
      (p) => 'provide' in p && p.provide === CONSUMER_MODULE_OPTIONS,
    ) as { useFactory: () => Promise<unknown> };
    await optionsProvider.useFactory();
    expect(factoryCallCount).toBe(1);
  });
});
