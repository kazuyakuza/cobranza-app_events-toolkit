import { MockProducerService } from './mock-producer.service';
import { MockDiscoveryEventPublisher } from './mock-discovery-event-publisher.service';
import { ServiceManifestDto } from '../discovery/dto/service-manifest.dto';
import { PLATFORM_REGISTER_SUBJECT } from '../discovery/events/platform-event-subjects';
import {
  expectRegistrationPublished,
  expectHeartbeatPublished,
  expectShutdownPublished,
  getRegistrationEvents,
  getHeartbeatEvents,
  getRegistrationManifest,
  expectRegistrationWithServiceName,
} from './discovery-assertion.helpers';

describe('discovery assertion helpers', () => {
  let producer: MockProducerService;
  let publisher: MockDiscoveryEventPublisher;
  const manifest: ServiceManifestDto = {
    name: 'payment-service',
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

  describe('expectRegistrationPublished', () => {
    it('passes when registration event exists', async () => {
      await publisher.publishRegistration(manifest);
      expect(() => expectRegistrationPublished(producer)).not.toThrow();
    });

    it('fails when no registration event', () => {
      expect(() => expectRegistrationPublished(producer)).toThrow();
    });
  });

  describe('expectHeartbeatPublished', () => {
    it('passes when heartbeat event exists', async () => {
      await publisher.publishHeartbeat(manifest);
      expect(() => expectHeartbeatPublished(producer)).not.toThrow();
    });
  });

  describe('expectShutdownPublished', () => {
    it('passes when shutdown event exists', async () => {
      await publisher.publishShutdown(manifest);
      expect(() => expectShutdownPublished(producer)).not.toThrow();
    });

    it('fails when no shutdown event', () => {
      expect(() => expectShutdownPublished(producer)).toThrow();
    });
  });

  describe('getRegistrationEvents', () => {
    it('returns registration events', async () => {
      await publisher.publishRegistration(manifest);
      const events = getRegistrationEvents(producer);
      expect(events.length).toBe(1);
      expect(events[0].subject).toBe(PLATFORM_REGISTER_SUBJECT);
    });
  });

  describe('getHeartbeatEvents', () => {
    it('returns heartbeat events', async () => {
      await publisher.publishHeartbeat(manifest);
      const events = getHeartbeatEvents(producer);
      expect(events.length).toBe(1);
    });
  });

  describe('getRegistrationManifest', () => {
    it('returns manifest data from first registration event', async () => {
      await publisher.publishRegistration(manifest);
      const result = getRegistrationManifest(producer);
      expect(result).toBeDefined();
      expect(result!.name).toBe('payment-service');
    });

    it('returns undefined when no registration events', () => {
      const result = getRegistrationManifest(producer);
      expect(result).toBeUndefined();
    });
  });

  describe('expectRegistrationWithServiceName', () => {
    it('passes when service name matches', async () => {
      await publisher.publishRegistration(manifest);
      expect(() => expectRegistrationWithServiceName(producer, 'payment-service')).not.toThrow();
    });

    it('fails when service name does not match', async () => {
      await publisher.publishRegistration(manifest);
      expect(() => expectRegistrationWithServiceName(producer, 'other-service')).toThrow();
    });
  });
});
