import 'reflect-metadata';
import { Test, TestingModule } from '@nestjs/testing';
import { JetStreamClient } from 'nats';
import { ProducerModule } from './producer.module';
import { ProducerService } from './producer.service';
import { EmitEventInterceptor } from './decorators/emit-event-interceptor';
import { EventLoggerService } from '../logging/event-logger.service';
import { JETSTREAM_TOKEN } from './producer.constants';

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
      moduleRef = await Test.createTestingModule({
        imports: [ProducerModule.forRoot({ jetStream: mockJetStream })],
      }).compile();

      expect(moduleRef.get(ProducerService)).toBeInstanceOf(ProducerService);
    });

    it('compiles and resolves EmitEventInterceptor with ProducerService injected', async () => {
      moduleRef = await Test.createTestingModule({
        imports: [ProducerModule.forRoot({ jetStream: mockJetStream })],
      }).compile();

      const interceptor = moduleRef.get(EmitEventInterceptor);
      expect(interceptor).toBeInstanceOf(EmitEventInterceptor);
    });

    it('provides EventLoggerService globally from the module', async () => {
      moduleRef = await Test.createTestingModule({
        imports: [ProducerModule.forRoot({ jetStream: mockJetStream })],
      }).compile();

      expect(moduleRef.get(EventLoggerService)).toBeInstanceOf(EventLoggerService);
    });
  });

  describe('forRootAsync', () => {
    it('compiles forRootAsync via factory and resolves ProducerService', async () => {
      moduleRef = await Test.createTestingModule({
        imports: [
          ProducerModule.forRootAsync({
            useFactory: async () => ({ jetStream: mockJetStream }),
            inject: [],
          }),
        ],
      }).compile();

      expect(moduleRef.get(ProducerService)).toBeInstanceOf(ProducerService);
      expect(moduleRef.get(EmitEventInterceptor)).toBeInstanceOf(EmitEventInterceptor);
    });
  });
});
