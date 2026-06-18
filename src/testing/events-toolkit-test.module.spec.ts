import { Test } from '@nestjs/testing';
import { ProducerService } from '../producer/producer.service';
import { ConsumerService } from '../consumer/consumer.service';
import { EventLoggerService } from '../logging/event-logger.service';
import { OutboxService } from '../outbox/outbox.service';
import { RequestReplyService } from '../request-reply/request-reply.service';
import { ManifestService } from '../discovery/manifest.service';
import { DiscoveryService } from '../discovery/discovery.service';
import { DiscoveryEventPublisher } from '../discovery/events/discovery-event-publisher.service';
import { EventsToolkitTestModule } from './events-toolkit-test.module';
import { MockProducerService } from './mock-producer.service';
import { MockConsumerService } from './mock-consumer.service';
import { MockEventLoggerService } from './mock-event-logger.service';
import { MockOutboxService } from './mock-outbox.service';
import { MockRequestReplyService } from './mock-request-reply.service';
import { MockManifestService } from './mock-manifest.service';
import { MockDiscoveryService } from './mock-discovery.service';
import { MockDiscoveryEventPublisher } from './mock-discovery-event-publisher.service';

describe('EventsToolkitTestModule', () => {
  it('provides MockProducerService as ProducerService', async () => {
    const module = await Test.createTestingModule({
      imports: [EventsToolkitTestModule.forRoot()],
    }).compile();

    const producer = module.get(ProducerService);
    expect(producer).toBeInstanceOf(MockProducerService);
  });

  it('provides MockConsumerService as ConsumerService', async () => {
    const module = await Test.createTestingModule({
      imports: [EventsToolkitTestModule.forRoot()],
    }).compile();

    const consumer = module.get(ConsumerService);
    expect(consumer).toBeInstanceOf(MockConsumerService);
  });

  it('provides MockEventLoggerService as EventLoggerService', async () => {
    const module = await Test.createTestingModule({
      imports: [EventsToolkitTestModule.forRoot()],
    }).compile();

    const logger = module.get(EventLoggerService);
    expect(logger).toBeInstanceOf(MockEventLoggerService);
  });

  it('provides MockOutboxService as OutboxService', async () => {
    const module = await Test.createTestingModule({
      imports: [EventsToolkitTestModule.forRoot()],
    }).compile();

    const outbox = module.get(OutboxService);
    expect(outbox).toBeInstanceOf(MockOutboxService);
  });

  it('provides MockRequestReplyService as RequestReplyService', async () => {
    const module = await Test.createTestingModule({
      imports: [EventsToolkitTestModule.forRoot()],
    }).compile();

    const requestReply = module.get(RequestReplyService);
    expect(requestReply).toBeInstanceOf(MockRequestReplyService);
  });

  it('injected ProducerService instance is the same as MockProducerService instance', async () => {
    const module = await Test.createTestingModule({
      imports: [EventsToolkitTestModule.forRoot()],
    }).compile();

    const producerService = module.get(ProducerService);
    const mockProducer = module.get(MockProducerService);
    expect(producerService).toBe(mockProducer);
  });

  it('all mock services are injectable and functional', async () => {
    const module = await Test.createTestingModule({
      imports: [EventsToolkitTestModule.forRoot()],
    }).compile();

    const mockProducer = module.get(MockProducerService);
    const mockConsumer = module.get(MockConsumerService);
    const mockLogger = module.get(MockEventLoggerService);
    const mockOutbox = module.get(MockOutboxService);
    const mockRequestReply = module.get(MockRequestReplyService);

    expect(mockProducer.count).toBe(0);
    expect(mockConsumer.handlerCount).toBe(0);
    expect(mockLogger.getLogs()).toEqual([]);
    expect(mockOutbox.count).toBe(0);
    expect(mockRequestReply.getRequests()).toEqual([]);
  });

  describe('with discovery enabled (default)', () => {
    it('provides MockManifestService as ManifestService', async () => {
      const module = await Test.createTestingModule({
        imports: [EventsToolkitTestModule.forRoot()],
      }).compile();

      const manifest = module.get(ManifestService);
      expect(manifest).toBeInstanceOf(MockManifestService);
    });

    it('provides MockDiscoveryService as DiscoveryService', async () => {
      const module = await Test.createTestingModule({
        imports: [EventsToolkitTestModule.forRoot()],
      }).compile();

      const discovery = module.get(DiscoveryService);
      expect(discovery).toBeInstanceOf(MockDiscoveryService);
    });

    it('provides MockDiscoveryEventPublisher as DiscoveryEventPublisher', async () => {
      const module = await Test.createTestingModule({
        imports: [EventsToolkitTestModule.forRoot()],
      }).compile();

      const publisher = module.get(DiscoveryEventPublisher);
      expect(publisher).toBeInstanceOf(MockDiscoveryEventPublisher);
    });
  });

  describe('with discovery disabled', () => {
    it('does not provide ManifestService', async () => {
      const module = await Test.createTestingModule({
        imports: [EventsToolkitTestModule.forRoot({ discovery: { enabled: false } })],
      }).compile();

      expect(() => module.get(ManifestService)).toThrow();
    });
  });
});
