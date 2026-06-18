import { MockDiscoveryEventPublisher } from './mock-discovery-event-publisher.service';
import { MockProducerService } from './mock-producer.service';
import { ServiceManifestDto } from '../discovery/dto/service-manifest.dto';
import {
  PLATFORM_REGISTER_SUBJECT,
  PLATFORM_HEARTBEAT_SUBJECT,
  PLATFORM_SHUTDOWN_SUBJECT,
} from '../discovery/events/platform-event-subjects';
import { PlatformEventType } from '../discovery/events/platform-event-types';

describe('MockDiscoveryEventPublisher', () => {
  let publisher: MockDiscoveryEventPublisher;
  let producer: MockProducerService;
  const testManifest: ServiceManifestDto = {
    name: 'test-service',
    version: '1.0.0',
    description: 'Test',
    instanceId: 'inst-001',
    consumes: [],
    produces: [],
  };

  beforeEach(() => {
    producer = new MockProducerService();
    publisher = new MockDiscoveryEventPublisher(producer);
  });

  it('publishes registration event to platform.service.register.v1', async () => {
    await publisher.publishRegistration(testManifest);
    const events = producer.getPublishedEventsBySubject(PLATFORM_REGISTER_SUBJECT);
    expect(events.length).toBe(1);
    expect(events[0].event.type).toBe(PlatformEventType.REGISTER);
    expect(events[0].event.data).toEqual(testManifest);
  });

  it('publishes heartbeat event to platform.service.heartbeat.v1', async () => {
    await publisher.publishHeartbeat(testManifest);
    const events = producer.getPublishedEventsBySubject(PLATFORM_HEARTBEAT_SUBJECT);
    expect(events.length).toBe(1);
    expect(events[0].event.type).toBe(PlatformEventType.HEARTBEAT);
  });

  it('publishes shutdown event to platform.service.shutdown.v1', async () => {
    await publisher.publishShutdown(testManifest);
    const events = producer.getPublishedEventsBySubject(PLATFORM_SHUTDOWN_SUBJECT);
    expect(events.length).toBe(1);
    expect(events[0].event.type).toBe(PlatformEventType.SHUTDOWN);
  });

  it('includes full manifest in heartbeat when configured via setter', async () => {
    publisher.setIncludeFullManifestInHeartbeat(true);
    await publisher.publishHeartbeat(testManifest);
    const events = producer.getPublishedEventsBySubject(PLATFORM_HEARTBEAT_SUBJECT);
    expect(events.length).toBe(1);
    const data = events[0].event.data as Record<string, unknown>;
    expect(data.manifest).toEqual(testManifest);
  });

  it('omits full manifest in heartbeat by default', async () => {
    await publisher.publishHeartbeat(testManifest);
    const events = producer.getPublishedEventsBySubject(PLATFORM_HEARTBEAT_SUBJECT);
    expect(events.length).toBe(1);
    const data = events[0].event.data as Record<string, unknown>;
    expect(data.manifest).toBeUndefined();
  });
});
