import { expect } from '@jest/globals';
import { MockProducerService } from './mock-producer.service';
import { PublishedEvent } from './published-event.interface';
import {
  PLATFORM_REGISTER_SUBJECT,
  PLATFORM_HEARTBEAT_SUBJECT,
  PLATFORM_SHUTDOWN_SUBJECT,
} from '../discovery/events/platform-event-subjects';
import { ServiceManifestDto } from '../discovery/dto/service-manifest.dto';
import { expectEventPublished } from './assertion.helpers';

/** Asserts that a platform.service.register.v1 event was published. */
export function expectRegistrationPublished(producer: MockProducerService): void {
  expectEventPublished(producer, PLATFORM_REGISTER_SUBJECT);
}

/** Asserts that a platform.service.heartbeat.v1 event was published. */
export function expectHeartbeatPublished(producer: MockProducerService): void {
  expectEventPublished(producer, PLATFORM_HEARTBEAT_SUBJECT);
}

/** Asserts that a platform.service.shutdown.v1 event was published. */
export function expectShutdownPublished(producer: MockProducerService): void {
  expectEventPublished(producer, PLATFORM_SHUTDOWN_SUBJECT);
}

/** Returns all registration events published by the producer. */
export function getRegistrationEvents(producer: MockProducerService): ReadonlyArray<PublishedEvent> {
  return producer.getPublishedEventsBySubject(PLATFORM_REGISTER_SUBJECT);
}

/** Returns all heartbeat events published by the producer. */
export function getHeartbeatEvents(producer: MockProducerService): ReadonlyArray<PublishedEvent> {
  return producer.getPublishedEventsBySubject(PLATFORM_HEARTBEAT_SUBJECT);
}

/** Returns the manifest data from the first registration event, or undefined if none. */
export function getRegistrationManifest(producer: MockProducerService): ServiceManifestDto | undefined {
  const events = getRegistrationEvents(producer);
  if (events.length === 0) {
    return undefined;
  }
  return events[0].event.data as ServiceManifestDto;
}

/** Asserts that a registration event was published with the expected service name. */
export function expectRegistrationWithServiceName(producer: MockProducerService, serviceName: string): void {
  const manifest = getRegistrationManifest(producer);
  expect(manifest).toBeDefined();
  expect(manifest!.name).toBe(serviceName);
}
