import 'reflect-metadata';
import { DiscoveryService, Reflector } from '@nestjs/core';
import { RequestReplyConsumerService } from '../request-reply-consumer.service';
import { OnRequestReplyExplorer } from './on-request-reply.explorer';
import { OnRequestReplyExplorerDeps } from './on-request-reply-explorer-deps.interface';
import { IdempotencyService } from '../../idempotency/idempotency.service';
import { MemoryIdempotencyRepository } from '../../idempotency/memory-idempotency.repository';
import { EventLoggerService } from '../../logging/event-logger.service';
import { EventEnvelope } from '../../common/envelope/event-envelope.class';
import { ActorType } from '../../common/envelope/actor-type.enum';
import { EventContext } from '../../common/envelope/event-context.interface';
import {
  IdempotentRequestReplyConsumer,
  FailingThenSucceedingRequestReplyConsumer,
  ExplicitFalseRequestReplyConsumer,
  SampleConsumer,
} from './on-request-reply.explorer.fixtures';

function createIdempotencyService(): IdempotencyService {
  const repository = new MemoryIdempotencyRepository();
  const logger = new EventLoggerService();
  return new IdempotencyService({ repository, logger });
}

function buildIdempotentEvent(): EventEnvelope {
  return new EventEnvelope({
    id: 'evt_idempotent',
    type: 'billing.invoice.adjusted',
    correlation_id: 'corr_idempotent',
  });
}

function buildEventContext(): EventContext {
  return {
    type: 'billing.invoice.adjusted',
    version: '1.0.0',
    producer: 'test-service',
    companyId: '550e8400-e29b-41d4-a716-446655440000',
    actorType: ActorType.CLIENT,
    actorId: 'user-123',
    correlationId: 'corr_idempotent',
  };
}

function createIdempotentExplorer<T extends object>(
  consumer: T,
  idempotencyService?: IdempotencyService,
): { requestReplyConsumerService: RequestReplyConsumerService } {
  const discovery = {
    getProviders: jest.fn(),
    getControllers: jest.fn(),
  } as unknown as DiscoveryService;
  const requestReplyConsumerService = new RequestReplyConsumerService({} as never);
  const localDeps: OnRequestReplyExplorerDeps = {
    discovery,
    reflector: new Reflector(),
    requestReplyConsumerService,
    idempotencyService,
  };
  const explorer = new OnRequestReplyExplorer(localDeps);
  (discovery.getProviders as jest.Mock).mockReturnValue([{ instance: consumer }]);
  (discovery.getControllers as jest.Mock).mockReturnValue([]);
  explorer.onModuleInit();
  return { requestReplyConsumerService };
}

describe('OnRequestReplyExplorer', () => {
  describe('onModuleInit', () => {
    describe('idempotent flag', () => {
      it('wraps handler with idempotency when idempotent:true and service present', async () => {
        const idempotencyService = createIdempotencyService();
        const idempotentHandler = new IdempotentRequestReplyConsumer();
        const { requestReplyConsumerService } = createIdempotentExplorer(idempotentHandler, idempotencyService);

        const handler = requestReplyConsumerService.getHandler('billing.invoice.adjusted', 'tenant-3');
        expect(handler).toBeDefined();

        const event = buildIdempotentEvent();
        const context = buildEventContext();

        await handler!(event, context);
        expect(idempotentHandler.invokeCount).toBe(1);

        await handler!(event, context);
        expect(idempotentHandler.invokeCount).toBe(1);
      });

      it('does not wrap when idempotent:true but idempotencyService is undefined', async () => {
        const idempotentHandler = new IdempotentRequestReplyConsumer();
        const { requestReplyConsumerService } = createIdempotentExplorer(idempotentHandler);

        const handler = requestReplyConsumerService.getHandler('billing.invoice.adjusted', 'tenant-3');
        expect(handler).toBeDefined();

        const event = buildIdempotentEvent();
        const context = buildEventContext();

        await handler!(event, context);
        expect(idempotentHandler.invokeCount).toBe(1);

        await handler!(event, context);
        expect(idempotentHandler.invokeCount).toBe(2);
      });

      it('does not wrap when idempotent flag is absent on decorated handler', async () => {
        const idempotencyService = createIdempotencyService();
        const sampleHandlerLocal = new SampleConsumer();
        const { requestReplyConsumerService } = createIdempotentExplorer(sampleHandlerLocal, idempotencyService);

        const handler = requestReplyConsumerService.getHandler('payment.proof.uploaded', 'tenant-1');
        expect(handler).toBeDefined();

        const event = new EventEnvelope({ id: 'evt_no_flag', type: 'payment.proof.uploaded' });
        const context = buildEventContext();

        await handler!(event, context);
        expect(sampleHandlerLocal.handlerInvoked).toBe(true);

        expect(await idempotencyService.isDuplicate(event)).toBe(false);
      });

      it('does not wrap when idempotent flag is explicitly false', async () => {
        const idempotencyService = createIdempotencyService();
        const handlerLocal = new ExplicitFalseRequestReplyConsumer();
        const { requestReplyConsumerService } = createIdempotentExplorer(handlerLocal, idempotencyService);

        const handler = requestReplyConsumerService.getHandler('billing.invoice.adjusted', 'tenant-3');
        expect(handler).toBeDefined();

        const event = new EventEnvelope({ id: 'evt_false', type: 'billing.invoice.adjusted' });
        const context = buildEventContext();

        await handler!(event, context);
        expect(handlerLocal.invokeCount).toBe(1);

        await handler!(event, context);
        expect(handlerLocal.invokeCount).toBe(2);
        expect(await idempotencyService.isDuplicate(event)).toBe(false);
      });

      it('marks and skips duplicate after successful handler execution', async () => {
        const idempotencyService = createIdempotencyService();
        const idempotentHandler = new IdempotentRequestReplyConsumer();
        const { requestReplyConsumerService } = createIdempotentExplorer(idempotentHandler, idempotencyService);

        const handler = requestReplyConsumerService.getHandler('billing.invoice.adjusted', 'tenant-3');
        expect(handler).toBeDefined();

        const event = buildIdempotentEvent();
        const context = buildEventContext();
        const event2 = new EventEnvelope({
          id: 'evt_idempotent_2',
          type: 'billing.invoice.adjusted',
          correlation_id: 'corr_idempotent_2',
        });

        await handler!(event, context);
        expect(idempotentHandler.invokeCount).toBe(1);
        expect(await idempotencyService.isDuplicate(event)).toBe(true);

        await handler!(event2, context);
        expect(idempotentHandler.invokeCount).toBe(2);
        expect(await idempotencyService.isDuplicate(event2)).toBe(true);
      });

      it('marks event as processed only when handler succeeds', async () => {
        const idempotencyService = createIdempotencyService();
        const idempotentHandler = new FailingThenSucceedingRequestReplyConsumer();
        const { requestReplyConsumerService } = createIdempotentExplorer(idempotentHandler, idempotencyService);

        const handler = requestReplyConsumerService.getHandler('billing.invoice.adjusted', 'tenant-3');
        expect(handler).toBeDefined();

        const event = buildIdempotentEvent();
        const context = buildEventContext();

        await expect(handler!(event, context)).rejects.toThrow('first attempt fails');
        expect(idempotentHandler.invokeCount).toBe(1);
        expect(await idempotencyService.isDuplicate(event)).toBe(false);

        idempotentHandler.shouldFail = false;
        await handler!(event, context);
        expect(idempotentHandler.invokeCount).toBe(2);
        expect(await idempotencyService.isDuplicate(event)).toBe(true);
      });
    });
  });
});
