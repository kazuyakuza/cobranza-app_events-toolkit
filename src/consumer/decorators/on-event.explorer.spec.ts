import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { DiscoveryService, Reflector } from '@nestjs/core';
import { ConsumerService } from '../consumer.service';
import { OnEventExplorer } from './on-event.explorer';
import { ON_EVENT_METADATA, OnEventOptions } from './on-event.decorator';
import { EventEnvelope } from '../../common/envelope/event-envelope.class';
import { ActorType } from '../../common/envelope/actor-type.enum';
import { EventContext } from '../../producer/producer.service';

class SampleConsumer {
  handlerInvoked = false;

  handleProofUploaded(_event: EventEnvelope<unknown>, _context: EventContext): void {
    this.handlerInvoked = true;
  }

  handleScheduleCreated(_event: EventEnvelope<unknown>, _context: EventContext): void {
    this.handlerInvoked = true;
  }

  plainMethod(): void {}
}

class ConsumerWithoutDecorator {
  noEventMethod(): void {}
}

describe('OnEventExplorer', () => {
  let explorer: OnEventExplorer;
  let consumerService: ConsumerService;

  const sampleHandler = new SampleConsumer();

  function applyOnEventMetadata(target: Function, options: OnEventOptions): void {
    Reflect.defineMetadata(ON_EVENT_METADATA, options, target);
  }

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        ConsumerService,
        OnEventExplorer,
        Reflector,
        {
          provide: DiscoveryService,
          useValue: {
            getProviders: jest.fn(),
            getControllers: jest.fn(),
          },
        },
      ],
    }).compile();

    explorer = module.get(OnEventExplorer);
    consumerService = module.get(ConsumerService);
  });

  describe('onModuleInit', () => {
    it('should discover and register handlers with @OnEvent metadata', () => {
      const proofOptions: OnEventOptions = { domain: 'payment', entity: 'proof', action: 'uploaded', version: '1' };
      const scheduleOptions: OnEventOptions = { domain: 'debt', entity: 'schedule', action: 'created' };

      applyOnEventMetadata(SampleConsumer.prototype.handleProofUploaded, proofOptions);
      applyOnEventMetadata(SampleConsumer.prototype.handleScheduleCreated, scheduleOptions);

      const discovery = explorer['discovery'] as DiscoveryService;
      (discovery.getProviders as jest.Mock).mockReturnValue([
        { instance: sampleHandler },
      ]);
      (discovery.getControllers as jest.Mock).mockReturnValue([]);

      explorer.onModuleInit();

      expect(consumerService.handlerCount).toBe(2);
      expect(consumerService.getHandler('company.*.payment.proof.uploaded.v1')).toBeDefined();
      expect(consumerService.getHandler('company.*.debt.schedule.created.v1')).toBeDefined();
    });

    it('should build wildcard subject with default version when not specified', () => {
      const options: OnEventOptions = { domain: 'debt', entity: 'schedule', action: 'created' };
      applyOnEventMetadata(SampleConsumer.prototype.handleProofUploaded, options);

      const discovery = explorer['discovery'] as DiscoveryService;
      (discovery.getProviders as jest.Mock).mockReturnValue([
        { instance: sampleHandler },
      ]);
      (discovery.getControllers as jest.Mock).mockReturnValue([]);

      explorer.onModuleInit();

      const handler = consumerService.getHandler('company.*.debt.schedule.created.v1');
      expect(handler).toBeDefined();
    });

    it('should skip providers and controllers without instance', () => {
      const discovery = explorer['discovery'] as DiscoveryService;
      (discovery.getProviders as jest.Mock).mockReturnValue([
        { instance: null },
        { instance: undefined },
      ]);
      (discovery.getControllers as jest.Mock).mockReturnValue([]);

      explorer.onModuleInit();

      expect(consumerService.handlerCount).toBe(0);
    });

    it('should skip methods without @OnEvent metadata', () => {
      const plainInstance = new ConsumerWithoutDecorator();
      const discovery = explorer['discovery'] as DiscoveryService;
      (discovery.getProviders as jest.Mock).mockReturnValue([
        { instance: plainInstance },
      ]);
      (discovery.getControllers as jest.Mock).mockReturnValue([]);

      explorer.onModuleInit();

      expect(consumerService.handlerCount).toBe(0);
    });

    it('should also scan controllers for @OnEvent handlers', () => {
      const proofOptions: OnEventOptions = { domain: 'payment', entity: 'proof', action: 'uploaded', version: '1' };
      const scheduleOptions: OnEventOptions = { domain: 'debt', entity: 'schedule', action: 'created' };

      applyOnEventMetadata(SampleConsumer.prototype.handleProofUploaded, proofOptions);
      applyOnEventMetadata(SampleConsumer.prototype.handleScheduleCreated, scheduleOptions);

      const discovery = explorer['discovery'] as DiscoveryService;
      (discovery.getProviders as jest.Mock).mockReturnValue([]);
      (discovery.getControllers as jest.Mock).mockReturnValue([
        { instance: sampleHandler },
      ]);

      explorer.onModuleInit();

      expect(consumerService.handlerCount).toBe(2);
    });

    it('should register bound handlers that correctly invoke instance methods', async () => {
      const options: OnEventOptions = { domain: 'payment', entity: 'proof', action: 'uploaded', version: '1' };
      applyOnEventMetadata(SampleConsumer.prototype.handleProofUploaded, options);

      const discovery = explorer['discovery'] as DiscoveryService;
      (discovery.getProviders as jest.Mock).mockReturnValue([
        { instance: sampleHandler },
      ]);
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

    it('should handle custom version in @OnEvent options', () => {
      const options: OnEventOptions = { domain: 'client', entity: 'profile', action: 'updated', version: '2' };
      applyOnEventMetadata(SampleConsumer.prototype.handleProofUploaded, options);

      const discovery = explorer['discovery'] as DiscoveryService;
      (discovery.getProviders as jest.Mock).mockReturnValue([
        { instance: sampleHandler },
      ]);
      (discovery.getControllers as jest.Mock).mockReturnValue([]);

      explorer.onModuleInit();

      expect(consumerService.getHandler('company.*.client.profile.updated.v2')).toBeDefined();
    });
  });
});