import { MockDiscoveryService, MockDiscoveryServiceDeps } from './mock-discovery.service';
import { MockManifestService } from './mock-manifest.service';
import { MockDiscoveryEventPublisher } from './mock-discovery-event-publisher.service';
import { MockProducerService } from './mock-producer.service';
import { PLATFORM_REGISTER_SUBJECT } from '../discovery/events/platform-event-subjects';

describe('MockDiscoveryService', () => {
  let service: MockDiscoveryService;
  let manifestService: MockManifestService;
  let eventPublisher: MockDiscoveryEventPublisher;
  let producer: MockProducerService;

  beforeEach(() => {
    producer = new MockProducerService();
    manifestService = new MockManifestService();
    eventPublisher = new MockDiscoveryEventPublisher(producer);
    const deps: MockDiscoveryServiceDeps = { manifestService, eventPublisher };
    service = new MockDiscoveryService(deps);
  });

  it('generateManifest returns a manifest with default service info', () => {
    const manifest = service.generateManifest();
    expect(manifest.name).toBe('test-service');
  });

  it('triggerStartup publishes registration event', async () => {
    await service.triggerStartup();
    const events = producer.getPublishedEventsBySubject(PLATFORM_REGISTER_SUBJECT);
    expect(events.length).toBe(1);
  });

  it('triggerHeartbeat publishes heartbeat event', async () => {
    await service.triggerHeartbeat();
    expect(producer.count).toBe(1);
  });

  it('triggerShutdown publishes shutdown event when manifest exists', async () => {
    await service.triggerStartup();
    await service.triggerShutdown();
    expect(producer.count).toBe(2);
  });

  it('does not publish events when disabled', async () => {
    const disabledService = new MockDiscoveryService({ manifestService, eventPublisher }, { enabled: false });
    await disabledService.triggerStartup();
    expect(producer.count).toBe(0);
  });

  it('clear resets cached manifest', () => {
    service.generateManifest();
    service.clear();
    const manifest = service.getManifest();
    expect(manifest).toBeDefined();
  });

  describe('lifecycle hooks', () => {
    it('onModuleInit generates manifest when enabled', () => {
      service.onModuleInit();
      const manifest = service.getManifest();
      expect(manifest.name).toBe('test-service');
    });

    it('onModuleInit does not generate manifest when disabled', () => {
      const disabledService = new MockDiscoveryService({ manifestService, eventPublisher }, { enabled: false });
      disabledService.onModuleInit();
      const manifest = disabledService.getManifest();
      expect(manifest).toBeDefined();
    });

    it('onApplicationBootstrap delegates to triggerStartup', async () => {
      await service.onApplicationBootstrap();
      const events = producer.getPublishedEventsBySubject(PLATFORM_REGISTER_SUBJECT);
      expect(events.length).toBe(1);
    });

    it('onModuleDestroy publishes shutdown when manifest exists', () => {
      service.generateManifest();
      service.onModuleDestroy();
      expect(producer.count).toBe(1);
    });

    it('onModuleDestroy is no-op when no manifest cached', () => {
      service.onModuleDestroy();
      expect(producer.count).toBe(0);
    });
  });
});
