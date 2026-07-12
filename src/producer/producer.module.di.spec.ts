import 'reflect-metadata';
import { Test, TestingModule } from '@nestjs/testing';
import { Global, Module } from '@nestjs/common';
import { JetStreamClient } from 'nats';
import { ProducerModule } from './producer.module';
import { ProducerService } from './producer.service';
import { EmitEventInterceptor } from './decorators/emit-event-interceptor';
import { EventLoggerService } from '../logging/event-logger.service';
import { JETSTREAM_TOKEN } from './producer.constants';

async function compileProducerModule(
  module: ReturnType<typeof ProducerModule.forRoot | typeof ProducerModule.forRootAsync>,
): Promise<TestingModule> {
  return Test.createTestingModule({ imports: [module] }).compile();
}

@Global()
@Module({
  providers: [
    { provide: JETSTREAM_TOKEN, useValue: { publish: jest.fn(), subscribe: jest.fn() } as unknown as JetStreamClient },
  ],
  exports: [JETSTREAM_TOKEN],
})
class GlobalJetStreamModule {}

describe('ProducerModule DI compilation', () => {
  let moduleRef: TestingModule;
  const mockJetStream = { publish: jest.fn(), subscribe: jest.fn() } as unknown as JetStreamClient;

  afterEach(async () => {
    if (moduleRef) {
      await moduleRef.close();
    }
  });

  describe('forRoot', () => {
    it('compiles and resolves ProducerService via DI', async () => {
      moduleRef = await compileProducerModule(ProducerModule.forRoot({ jetStream: mockJetStream }));

      expect(moduleRef.get(ProducerService)).toBeInstanceOf(ProducerService);
    });

    it('compiles and resolves EmitEventInterceptor with ProducerService injected', async () => {
      moduleRef = await compileProducerModule(ProducerModule.forRoot({ jetStream: mockJetStream }));

      const interceptor = moduleRef.get(EmitEventInterceptor);
      expect(interceptor).toBeInstanceOf(EmitEventInterceptor);
    });

    it('provides EventLoggerService globally from the module', async () => {
      moduleRef = await compileProducerModule(ProducerModule.forRoot({ jetStream: mockJetStream }));

      expect(moduleRef.get(EventLoggerService)).toBeInstanceOf(EventLoggerService);
    });
  });

  describe('forRootAsync', () => {
    it('compiles forRootAsync via factory and resolves ProducerService', async () => {
      moduleRef = await compileProducerModule(
        ProducerModule.forRootAsync({
          useFactory: async () => ({ jetStream: mockJetStream }),
          inject: [],
        }),
      );

      expect(moduleRef.get(ProducerService)).toBeInstanceOf(ProducerService);
      expect(moduleRef.get(EmitEventInterceptor)).toBeInstanceOf(EmitEventInterceptor);
    });

    it('compiles forRootAsync with useExisting and resolves ProducerService', async () => {
      moduleRef = await Test.createTestingModule({
        imports: [
          GlobalJetStreamModule,
          ProducerModule.forRootAsync({
            useExisting: JETSTREAM_TOKEN,
            useFactory: async () => ({}),
            inject: [],
          }),
        ],
      }).compile();

      expect(moduleRef.get(ProducerService)).toBeInstanceOf(ProducerService);
      expect(moduleRef.get(EmitEventInterceptor)).toBeInstanceOf(EmitEventInterceptor);
    });
  });
});
