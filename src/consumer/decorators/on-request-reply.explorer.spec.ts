import 'reflect-metadata';
import { DiscoveryService, Reflector } from '@nestjs/core';
import { RequestReplyConsumerService } from '../request-reply-consumer.service';
import { OnRequestReplyExplorer } from './on-request-reply.explorer';
import { OnRequestReply } from './on-request-reply.decorator';
import { OnRequestReplyExplorerDeps } from './on-request-reply-explorer-deps.interface';

class SampleConsumer {
  handlerInvoked = false;

  @OnRequestReply('payment.proof.uploaded', { companyId: 'tenant-1' })
  handleProofUploaded(): void {
    this.handlerInvoked = true;
  }

  @OnRequestReply('debt.schedule.created')
  handleScheduleCreated(): void {
    this.handlerInvoked = true;
  }

  plainMethod(): void {}
}

class ConsumerWithoutDecorator {
  noEventMethod(): void {}
}

class CompanyScopedConsumer {
  handlerInvoked = false;

  @OnRequestReply('client.profile.updated', { companyId: 'tenant-2' })
  handleUpdated(): void {
    this.handlerInvoked = true;
  }
}

function createDeps(discovery: DiscoveryService): OnRequestReplyExplorerDeps {
  return {
    discovery,
    reflector: new Reflector(),
    requestReplyConsumerService: new RequestReplyConsumerService({} as never),
  };
}

describe('OnRequestReplyExplorer', () => {
  let explorer: OnRequestReplyExplorer;
  let requestReplyConsumerService: RequestReplyConsumerService;
  let discovery: DiscoveryService;

  const sampleHandler = new SampleConsumer();

  beforeEach(() => {
    discovery = {
      getProviders: jest.fn(),
      getControllers: jest.fn(),
    } as unknown as DiscoveryService;

    const deps = createDeps(discovery);
    requestReplyConsumerService = deps.requestReplyConsumerService;
    explorer = new OnRequestReplyExplorer(deps);
  });

  describe('onModuleInit', () => {
    it('should discover and register handlers with @OnRequestReply metadata', () => {
      (discovery.getProviders as jest.Mock).mockReturnValue([{ instance: sampleHandler }]);
      (discovery.getControllers as jest.Mock).mockReturnValue([]);

      explorer.onModuleInit();

      expect(requestReplyConsumerService.handlerCount).toBe(2);
      expect(requestReplyConsumerService.getHandler('payment.proof.uploaded', 'tenant-1')).toBeDefined();
      expect(requestReplyConsumerService.getHandler('debt.schedule.created')).toBeDefined();
    });

    it('should register handler with eventType only (no companyId)', () => {
      (discovery.getProviders as jest.Mock).mockReturnValue([{ instance: sampleHandler }]);
      (discovery.getControllers as jest.Mock).mockReturnValue([]);

      explorer.onModuleInit();

      const handler = requestReplyConsumerService.getHandler('debt.schedule.created');
      expect(handler).toBeDefined();
    });

    it('should register handler with both eventType and companyId', () => {
      (discovery.getProviders as jest.Mock).mockReturnValue([{ instance: sampleHandler }]);
      (discovery.getControllers as jest.Mock).mockReturnValue([]);

      explorer.onModuleInit();

      const handler = requestReplyConsumerService.getHandler('payment.proof.uploaded', 'tenant-1');
      expect(handler).toBeDefined();
    });

    it('should skip providers and controllers without instance', () => {
      (discovery.getProviders as jest.Mock).mockReturnValue([{ instance: null }, { instance: undefined }]);
      (discovery.getControllers as jest.Mock).mockReturnValue([]);

      explorer.onModuleInit();

      expect(requestReplyConsumerService.handlerCount).toBe(0);
    });

    it('should skip methods without @OnRequestReply metadata', () => {
      const plainInstance = new ConsumerWithoutDecorator();
      (discovery.getProviders as jest.Mock).mockReturnValue([{ instance: plainInstance }]);
      (discovery.getControllers as jest.Mock).mockReturnValue([]);

      explorer.onModuleInit();

      expect(requestReplyConsumerService.handlerCount).toBe(0);
    });

    it('should also scan controllers for @OnRequestReply handlers', () => {
      (discovery.getProviders as jest.Mock).mockReturnValue([]);
      (discovery.getControllers as jest.Mock).mockReturnValue([{ instance: sampleHandler }]);

      explorer.onModuleInit();

      expect(requestReplyConsumerService.handlerCount).toBe(2);
    });

    it('should register bound handlers that correctly invoke instance methods', async () => {
      (discovery.getProviders as jest.Mock).mockReturnValue([{ instance: sampleHandler }]);
      (discovery.getControllers as jest.Mock).mockReturnValue([]);

      explorer.onModuleInit();

      const handler = requestReplyConsumerService.getHandler('payment.proof.uploaded', 'tenant-1');
      expect(handler).toBeDefined();

      const event = new (await import('../../common/envelope/event-envelope.class')).EventEnvelope({
        id: 'evt_test',
        type: 'payment.proof.uploaded',
      });
      const context = {
        type: 'payment.proof.uploaded',
        version: '1.0.0',
        producer: 'payment-service',
        companyId: 'tenant-1',
        actorType: (await import('../../common/envelope/actor-type.enum')).ActorType.CLIENT,
        actorId: 'user-123',
        correlationId: '660e8400-e29b-41d4-a716-446655440001',
      };

      await handler!(event, context);
      expect(sampleHandler.handlerInvoked).toBe(true);
    });

    it('should handle company-scoped @OnRequestReply options', () => {
      const instance = new CompanyScopedConsumer();
      (discovery.getProviders as jest.Mock).mockReturnValue([{ instance }]);
      (discovery.getControllers as jest.Mock).mockReturnValue([]);

      explorer.onModuleInit();

      const handler = requestReplyConsumerService.getHandler('client.profile.updated', 'tenant-2');
      expect(handler).toBeDefined();
      expect(requestReplyConsumerService.handlerCount).toBe(1);
    });
  });
});
