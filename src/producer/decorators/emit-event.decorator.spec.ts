import 'reflect-metadata';
import { of } from 'rxjs';
import { ExecutionContext, CallHandler } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { EmitEventInterceptor } from './emit-event-interceptor';
import { EMIT_EVENT_METADATA, EmitEventOptions } from './emit-event.decorator';
import { ProducerService, EventContext } from '../producer.service';
import { JETSTREAM_TOKEN } from '../producer.module';
import { EventLoggerService } from '../../logging/event-logger.service';
import { ActorType } from '../../common/envelope/actor-type.enum';

jest.mock('../../common/utils/uuid.utils', () => ({
  generateEventId: jest.fn(() => 'evt_mock-uuid-9999'),
}));

jest.mock('../../common/utils/date.utils', () => ({
  nowIso: jest.fn(() => '2026-06-13T16:00:00.000Z'),
}));

describe('EmitEvent', () => {
  it('should store metadata on the method via SetMetadata', () => {
    const options: EmitEventOptions = {
      domain: 'payment',
      entity: 'proof',
      action: 'uploaded',
      version: '2',
    };

    const handler = function handleUpload() {};
    Reflect.defineMetadata(EMIT_EVENT_METADATA, options, handler);

    const metadata = Reflect.getMetadata(EMIT_EVENT_METADATA, handler);
    expect(metadata).toEqual(options);
  });

  it('should store metadata without version', () => {
    const options: EmitEventOptions = {
      domain: 'debt',
      entity: 'schedule',
      action: 'processed',
    };

    const handler = function handleProcessed() {};
    Reflect.defineMetadata(EMIT_EVENT_METADATA, options, handler);

    const metadata = Reflect.getMetadata(EMIT_EVENT_METADATA, handler);
    expect(metadata).toEqual(options);
  });
});

describe('EmitEventInterceptor', () => {
  let interceptor: EmitEventInterceptor;
  let reflector: Reflector;
  let producerService: ProducerService;
  let mockLoggerService: { logEventEmitted: jest.Mock; logEventError: jest.Mock };

  const sampleContext: EventContext = {
    type: 'payment.proof.uploaded',
    version: '1.0.0',
    producer: 'payment-service',
    companyId: '550e8400-e29b-41d4-a716-446655440000',
    actorType: ActorType.CLIENT,
    actorId: 'user-123',
    correlationId: '660e8400-e29b-41d4-a716-446655440001',
  };

  beforeEach(async () => {
    const jetStream = { publish: jest.fn().mockResolvedValue({}) };
    mockLoggerService = { logEventEmitted: jest.fn(), logEventError: jest.fn() };

    const testingModule = await Test.createTestingModule({
      providers: [
        { provide: JETSTREAM_TOKEN, useValue: jetStream },
        { provide: EventLoggerService, useValue: mockLoggerService },
        ProducerService,
        Reflector,
      ],
    }).compile();

    producerService = testingModule.get(ProducerService);
    reflector = testingModule.get(Reflector);
    interceptor = new EmitEventInterceptor(reflector, producerService);
  });

  const createMockExecutionContext = (handler: (...args: unknown[]) => unknown, args: unknown[]): ExecutionContext => {
    return {
      getHandler: () => handler,
      getArgs: () => args,
      switchToHttp: jest.fn(),
      switchToRpc: jest.fn(),
      getType: jest.fn(),
      getClass: jest.fn(),
    } as unknown as ExecutionContext;
  };

  const createMockCallHandler = (returnValue: unknown): CallHandler => {
    return {
      handle: () => of(returnValue),
    } as CallHandler;
  };

  describe('intercept', () => {
    it('should pass through when no @EmitEvent metadata is present', async () => {
      const handler = function noMetadata() {};
      const context = createMockExecutionContext(handler, [sampleContext]);
      const callHandler = createMockCallHandler({ result: 'data' });

      const result$ = interceptor.intercept(context, callHandler);
      const emittedEvents: unknown[] = [];
      await new Promise<void>((resolve) => {
        result$.subscribe({ next: (val) => emittedEvents.push(val), complete: resolve });
      });

      expect(emittedEvents).toEqual([{ result: 'data' }]);
    });

    it('should emit event when @EmitEvent metadata is present', async () => {
      const options: EmitEventOptions = {
        domain: 'payment',
        entity: 'proof',
        action: 'uploaded',
        version: '1',
      };

      const handler = function withMetadata() {};
      Reflect.defineMetadata(EMIT_EVENT_METADATA, options, handler);

      const data = { amount: 250 };
      const context = createMockExecutionContext(handler, [data, sampleContext]);
      const callHandler = createMockCallHandler(data);

      const emitSpy = jest.spyOn(producerService, 'emit');
      const result$ = interceptor.intercept(context, callHandler);

      await new Promise<void>((resolve) => {
        result$.subscribe({ next: () => {}, complete: resolve });
      });

      expect(emitSpy).toHaveBeenCalledTimes(1);
      expect(emitSpy).toHaveBeenCalledWith({
        subject: 'company.550e8400e29b41d4a716446655440000.payment.proof.uploaded.v1',
        data,
        context: sampleContext,
      });
    });

    it('should emit event with default version when version is not specified', async () => {
      const options: EmitEventOptions = {
        domain: 'debt',
        entity: 'schedule',
        action: 'processed',
      };

      const handler = function noVersion() {};
      Reflect.defineMetadata(EMIT_EVENT_METADATA, options, handler);

      const data = { scheduleId: 'sch-1' };
      const context = createMockExecutionContext(handler, [data, sampleContext]);
      const callHandler = createMockCallHandler(data);

      const emitSpy = jest.spyOn(producerService, 'emit');
      const result$ = interceptor.intercept(context, callHandler);

      await new Promise<void>((resolve) => {
        result$.subscribe({ next: () => {}, complete: resolve });
      });

      expect(emitSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          subject: 'company.550e8400e29b41d4a716446655440000.debt.schedule.processed.v1',
        }),
      );
    });

    it('should skip emission when EventContext is not found in arguments', async () => {
      const options: EmitEventOptions = {
        domain: 'payment',
        entity: 'proof',
        action: 'uploaded',
      };

      const handler = function noContextArg() {};
      Reflect.defineMetadata(EMIT_EVENT_METADATA, options, handler);

      const context = createMockExecutionContext(handler, [{ plainData: true }]);
      const callHandler = createMockCallHandler('result');

      const emitSpy = jest.spyOn(producerService, 'emit');
      const result$ = interceptor.intercept(context, callHandler);

      await new Promise<void>((resolve) => {
        result$.subscribe({ next: () => {}, complete: resolve });
      });

      expect(emitSpy).not.toHaveBeenCalled();
    });

    it('should find EventContext among multiple arguments', async () => {
      const options: EmitEventOptions = {
        domain: 'payment',
        entity: 'proof',
        action: 'uploaded',
      };

      const handler = function multipleArgs() {};
      Reflect.defineMetadata(EMIT_EVENT_METADATA, options, handler);

      const data = { proofId: 'p-1' };
      const request = { headers: {} };
      const context = createMockExecutionContext(handler, [data, request, sampleContext]);
      const callHandler = createMockCallHandler(data);

      const emitSpy = jest.spyOn(producerService, 'emit');
      const result$ = interceptor.intercept(context, callHandler);

      await new Promise<void>((resolve) => {
        result$.subscribe({ next: () => {}, complete: resolve });
      });

      expect(emitSpy).toHaveBeenCalledTimes(1);
      expect(emitSpy).toHaveBeenCalledWith(
        expect.objectContaining({ context: sampleContext }),
      );
    });

    it('should return the original handler return value', async () => {
      const options: EmitEventOptions = {
        domain: 'payment',
        entity: 'proof',
        action: 'uploaded',
      };

      const handler = function returnValue() {};
      Reflect.defineMetadata(EMIT_EVENT_METADATA, options, handler);

      const returnValue = { id: 'evt-123', type: 'proof_uploaded' };
      const context = createMockExecutionContext(handler, [returnValue, sampleContext]);
      const callHandler = createMockCallHandler(returnValue);

      const result$ = interceptor.intercept(context, callHandler);
      const results: unknown[] = [];
      await new Promise<void>((resolve) => {
        result$.subscribe({ next: (val) => results.push(val), complete: resolve });
      });

      expect(results).toEqual([returnValue]);
    });
  });
});