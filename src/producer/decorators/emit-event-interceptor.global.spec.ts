import 'reflect-metadata';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { EmitEventInterceptor } from './emit-event-interceptor';
import { EmitEvent } from './emit-event.decorator';
import { ProducerService } from '../producer.service';
import { JETSTREAM_TOKEN } from '../producer.constants';
import { EventLoggerService } from '../../logging/event-logger.service';
import { EventScope } from '../../common/envelope/event-scope.enum';
import { GlobalEventContext } from '../../common/envelope/global-event-context.interface';
import { ActorType } from '../../common/envelope/actor-type.enum';
import { createMockExecutionContext, createMockCallHandler } from './__tests__/helpers';

jest.mock('../../common/utils/uuid.utils', () => ({
  generateEventId: jest.fn(() => 'evt_mock-uuid-9999'),
}));

jest.mock('../../common/utils/date.utils', () => ({
  nowIso: jest.fn(() => '2026-06-13T16:00:00.000Z'),
}));

const globalContext: GlobalEventContext = {
  type: 'iam.company.created',
  version: '1.0.0',
  producer: 'iam-service',
  actorType: ActorType.SYSTEM,
  correlationId: '770e8400-e29b-41d4-a716-446655440002',
};

describe('EmitEventInterceptor — global scope', () => {
  let interceptor: EmitEventInterceptor;
  let producerService: ProducerService;

  beforeEach(async () => {
    const jetStream = { publish: jest.fn().mockResolvedValue({}) };
    const mockLoggerService = { logEventEmitted: jest.fn(), logEventError: jest.fn() };

    const testingModule = await Test.createTestingModule({
      providers: [
        { provide: JETSTREAM_TOKEN, useValue: jetStream },
        { provide: EventLoggerService, useValue: mockLoggerService },
        ProducerService,
        Reflector,
      ],
    }).compile();

    producerService = testingModule.get(ProducerService);
    const reflector = testingModule.get(Reflector);
    interceptor = new EmitEventInterceptor(reflector, producerService);
  });

  async function subscribeToResult(result$: import('rxjs').Observable<unknown>): Promise<unknown[]> {
    const collected: unknown[] = [];
    await new Promise<void>((resolve) => {
      result$.subscribe({ next: (val) => collected.push(val), complete: resolve });
    });
    return collected;
  }

  it('emits a global event when scope is EventScope.GLOBAL', async () => {
    class GlobalProducer {
      @EmitEvent('iam.company.created', {
        version: '1',
        description: 'Company created',
        payloadExample: { name: 'Acme' },
        scope: EventScope.GLOBAL,
      })
      handleCreate(): void {}
    }
    const handler = GlobalProducer.prototype.handleCreate;
    const data = { name: 'Acme' };
    const context = createMockExecutionContext(handler, [data, globalContext]);
    const emitGlobalSpy = jest.spyOn(producerService, 'emitGlobal');
    await subscribeToResult(interceptor.intercept(context, createMockCallHandler(data)));
    expect(emitGlobalSpy).toHaveBeenCalledWith({
      subject: 'global.iam.company.created.v1',
      data,
      context: globalContext,
    });
  });
});
