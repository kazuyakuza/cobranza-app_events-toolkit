import 'reflect-metadata';
import { DiscoveryService, Reflector } from '@nestjs/core';
import { ConsumerService } from '../consumer.service';
import { OnEventExplorer } from './on-event.explorer';
import { OnEventExplorerDeps } from './on-event-explorer-deps.interface';
import { EventEnvelope } from '../../common/envelope/event-envelope.class';
import { ActorType } from '../../common/envelope/actor-type.enum';
import { EventContext } from '../../common/envelope/event-context.interface';
import {
  SampleConsumer,
  ConsumerWithoutDecorator,
  CustomVersionConsumer,
  GetterSetterConsumer,
} from './on-event.explorer.fixtures';

function createDeps(discovery: DiscoveryService): OnEventExplorerDeps {
  return { discovery, reflector: new Reflector(), consumerService: new ConsumerService() };
}

describe('OnEventExplorer', () => {
  let explorer: OnEventExplorer;
  let consumerService: ConsumerService;
  let discovery: DiscoveryService;

  const sampleHandler = new SampleConsumer();

  beforeEach(() => {
    discovery = {
      getProviders: jest.fn(),
      getControllers: jest.fn(),
    } as unknown as DiscoveryService;

    const deps = createDeps(discovery);
    consumerService = deps.consumerService;
    explorer = new OnEventExplorer(deps);
  });

  describe('onModuleInit', () => {
    it('should discover and register handlers with @OnEvent metadata', () => {
      (discovery.getProviders as jest.Mock).mockReturnValue([{ instance: sampleHandler }]);
      (discovery.getControllers as jest.Mock).mockReturnValue([]);

      explorer.onModuleInit();

      expect(consumerService.handlerCount).toBe(2);
      expect(consumerService.getHandler('company.*.payment.proof.uploaded.v1')).toBeDefined();
      expect(consumerService.getHandler('company.*.debt.schedule.created.v1')).toBeDefined();
    });

    it('should build wildcard subject with explicit version v1', () => {
      (discovery.getProviders as jest.Mock).mockReturnValue([{ instance: sampleHandler }]);
      (discovery.getControllers as jest.Mock).mockReturnValue([]);

      explorer.onModuleInit();

      const handler = consumerService.getHandler('company.*.debt.schedule.created.v1');
      expect(handler).toBeDefined();
    });

    it('should skip providers and controllers without instance', () => {
      (discovery.getProviders as jest.Mock).mockReturnValue([{ instance: null }, { instance: undefined }]);
      (discovery.getControllers as jest.Mock).mockReturnValue([]);

      explorer.onModuleInit();

      expect(consumerService.handlerCount).toBe(0);
    });

    it('should skip methods without @OnEvent metadata', () => {
      const plainInstance = new ConsumerWithoutDecorator();
      (discovery.getProviders as jest.Mock).mockReturnValue([{ instance: plainInstance }]);
      (discovery.getControllers as jest.Mock).mockReturnValue([]);

      explorer.onModuleInit();

      expect(consumerService.handlerCount).toBe(0);
    });

    it('should also scan controllers for @OnEvent handlers', () => {
      (discovery.getProviders as jest.Mock).mockReturnValue([]);
      (discovery.getControllers as jest.Mock).mockReturnValue([{ instance: sampleHandler }]);

      explorer.onModuleInit();

      expect(consumerService.handlerCount).toBe(2);
    });

    it('should register bound handlers that correctly invoke instance methods', async () => {
      (discovery.getProviders as jest.Mock).mockReturnValue([{ instance: sampleHandler }]);
      (discovery.getControllers as jest.Mock).mockReturnValue([]);

      explorer.onModuleInit();

      const handler = consumerService.getHandler('company.*.payment.proof.uploaded.v1');
      expect(handler).toBeDefined();

      const event = new EventEnvelope({ id: 'evt_test', type: 'payment.proof.uploaded' });
      const context: EventContext = {
        type: 'payment.proof.uploaded',
        version: '1.0.0',
        producer: 'payment-service',
        companyId: '550e8400-e29b-41d4-a716-446655440000',
        actorType: ActorType.CLIENT,
        actorId: 'user-123',
        correlationId: '660e8400-e29b-41d4-a716-446655440001',
      };

      await handler!(event, context);
      expect(sampleHandler.handlerInvoked).toBe(true);
    });

    it('should register handler for global scope subject', () => {
      // Use the private buildWildcardSubject method by reading from explorer prototype
      const subject = (explorer as unknown as { buildWildcardSubject: (m: { scope?: string; eventType: string; version: string }) => string }).buildWildcardSubject({
        scope: 'global',
        eventType: 'iam.company.created',
        version: '1',
      });
      expect(subject).toBe('global.iam.company.created.v1');
    });

    it('should register handler for tenant scope subject by default', () => {
      const subject = (explorer as unknown as { buildWildcardSubject: (m: { scope?: string; eventType: string; version: string }) => string }).buildWildcardSubject({
        eventType: 'payment.proof.uploaded',
        version: '1',
      });
      expect(subject).toBe('company.*.payment.proof.uploaded.v1');
    });

    it('should handle custom version in @OnEvent options', () => {
      const instance = new CustomVersionConsumer();
      (discovery.getProviders as jest.Mock).mockReturnValue([{ instance }]);
      (discovery.getControllers as jest.Mock).mockReturnValue([]);

      explorer.onModuleInit();

      expect(consumerService.getHandler('company.*.client.profile.updated.v2')).toBeDefined();
    });

    it('should skip accessor properties, including throwing getters, without invoking them', () => {
      const instance = new GetterSetterConsumer();
      (discovery.getProviders as jest.Mock).mockReturnValue([{ instance }]);
      (discovery.getControllers as jest.Mock).mockReturnValue([]);

      const prototype = Object.getPrototypeOf(instance);
      const listenGetter = Object.getOwnPropertyDescriptor(prototype, 'listen$')?.get;
      expect(listenGetter).toBeDefined();
      expect(() => listenGetter!()).toThrow(TypeError);

      expect(() => explorer.onModuleInit()).not.toThrow();
      expect(consumerService.handlerCount).toBe(1);
      expect(consumerService.getHandler('company.*.audit.ledger.snapshot.v1')).toBeDefined();
    });
  });
});
