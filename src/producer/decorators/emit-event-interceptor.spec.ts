import 'reflect-metadata';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { EmitEventInterceptor } from './emit-event-interceptor';
import { EmitEvent } from './emit-event.decorator';
import { ProducerService } from '../producer.service';
import { JETSTREAM_TOKEN } from '../producer.module';
import { EventLoggerService } from '../../logging/event-logger.service';
import { sampleContext, createMockExecutionContext, createMockCallHandler } from './__tests__/helpers';

jest.mock('../../common/utils/uuid.utils', () => ({
  generateEventId: jest.fn(() => 'evt_mock-uuid-9999'),
}));

jest.mock('../../common/utils/date.utils', () => ({
  nowIso: jest.fn(() => '2026-06-13T16:00:00.000Z'),
}));

describe('EmitEventInterceptor', () => {
  let interceptor: EmitEventInterceptor;
  let producerService: ProducerService;
  let mockLoggerService: { logEventEmitted: jest.Mock; logEventError: jest.Mock };

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

  describe('intercept', () => {
    it('should pass through when no @EmitEvent metadata is present', async () => {
      class NoMetadataProducer {
        handleRequest(): void {}
      }
      const handler = NoMetadataProducer.prototype.handleRequest;
      const context = createMockExecutionContext(handler, [sampleContext]);
      const result$ = interceptor.intercept(context, createMockCallHandler({ result: 'data' }));
      const results = await subscribeToResult(result$);
      expect(results).toEqual([{ result: 'data' }]);
    });

    it('should emit event when @EmitEvent metadata is present', async () => {
      class WithMetadataProducer {
        @EmitEvent('payment.proof.uploaded', {
          version: '1',
          description: 'Proof was uploaded',
          payloadExample: { proofId: 'proof-123' },
        })
        handleUpload(): void {}
      }
      const handler = WithMetadataProducer.prototype.handleUpload;
      const data = { amount: 250 };
      const context = createMockExecutionContext(handler, [data, sampleContext]);
      const emitSpy = jest.spyOn(producerService, 'emit');
      await subscribeToResult(interceptor.intercept(context, createMockCallHandler(data)));
      expect(emitSpy).toHaveBeenCalledWith({
        subject: 'company.550e8400-e29b-41d4-a716-446655440000.payment.proof.uploaded.v1',
        data,
        context: sampleContext,
      });
    });

    it('should emit event with explicit version v1', async () => {
      class NoVersionProducer {
        @EmitEvent('debt.schedule.processed', {
          version: '1',
          description: 'Schedule processed',
          payloadExample: { scheduleId: 'sch-1' },
        })
        handleProcessed(): void {}
      }
      const handler = NoVersionProducer.prototype.handleProcessed;
      const data = { scheduleId: 'sch-1' };
      const context = createMockExecutionContext(handler, [data, sampleContext]);
      const emitSpy = jest.spyOn(producerService, 'emit');
      await subscribeToResult(interceptor.intercept(context, createMockCallHandler(data)));
      expect(emitSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          subject: 'company.550e8400-e29b-41d4-a716-446655440000.debt.schedule.processed.v1',
        }),
      );
    });

    it('should skip emission when EventContext is not found in arguments', async () => {
      class NoContextProducer {
        @EmitEvent('payment.proof.uploaded', {
          version: '1',
          description: 'Proof was uploaded',
          payloadExample: { proofId: 'proof-123' },
        })
        handleUpload(): void {}
      }
      const handler = NoContextProducer.prototype.handleUpload;
      const context = createMockExecutionContext(handler, [{ plainData: true }]);
      const emitSpy = jest.spyOn(producerService, 'emit');
      await subscribeToResult(interceptor.intercept(context, createMockCallHandler('result')));
      expect(emitSpy).not.toHaveBeenCalled();
    });

    it('should find EventContext among multiple arguments', async () => {
      class MultipleArgsProducer {
        @EmitEvent('payment.proof.uploaded', {
          version: '1',
          description: 'Proof was uploaded',
          payloadExample: { proofId: 'p-1' },
        })
        handleUpload(): void {}
      }
      const handler = MultipleArgsProducer.prototype.handleUpload;
      const data = { proofId: 'p-1' };
      const context = createMockExecutionContext(handler, [data, { headers: {} }, sampleContext]);
      const emitSpy = jest.spyOn(producerService, 'emit');
      await subscribeToResult(interceptor.intercept(context, createMockCallHandler(data)));
      expect(emitSpy).toHaveBeenCalledWith(expect.objectContaining({ context: sampleContext }));
    });

    it('should return the original handler return value', async () => {
      class ReturnValueProducer {
        @EmitEvent('payment.proof.uploaded', {
          version: '1',
          description: 'Proof was uploaded',
          payloadExample: { proofId: 'proof-123' },
        })
        handleUpload(): void {}
      }
      const handler = ReturnValueProducer.prototype.handleUpload;
      const returnValue = { id: 'evt-123', type: 'proof_uploaded' };
      const context = createMockExecutionContext(handler, [returnValue, sampleContext]);
      const results = await subscribeToResult(interceptor.intercept(context, createMockCallHandler(returnValue)));
      expect(results).toEqual([returnValue]);
    });
  });
});
