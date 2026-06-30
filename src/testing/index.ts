/**
 * @packageDocumentation
 * Testing utilities — mock services, test module, and assertion helpers for unit-testing
 * NestJS services that depend on @cobranza-apps/events-toolkit.
 */

export { MockProducerService } from './mock-producer.service';
export { MockConsumerService } from './mock-consumer.service';
export { MockEventLoggerService, LogRecord, LogMethod } from './mock-event-logger.service';
export { MockOutboxService } from './mock-outbox.service';
export { MockRequestReplyService, RequestCall, SendResponseCall } from './mock-request-reply.service';
export { MockManifestService } from './mock-manifest.service';
export { MockDiscoveryEventPublisher } from './mock-discovery-event-publisher.service';
export { MockDiscoveryService, MockDiscoveryServiceDeps, MockDiscoveryServiceConfig } from './mock-discovery.service';
export { EventsToolkitTestModule } from './events-toolkit-test.module';
export { EventsToolkitTestModuleOptions, DiscoveryTestOptions } from './events-toolkit-test-options.interface';
export {
  expectEventPublished,
  expectNoEventsPublished,
  expectEventWithMatch,
  expectEnvelope,
  EventMatchOptions,
  EnvelopeExpectations,
} from './assertion.helpers';
export {
  expectRegistrationPublished,
  expectHeartbeatPublished,
  expectShutdownPublished,
  getRegistrationEvents,
  getHeartbeatEvents,
  getRegistrationManifest,
  expectRegistrationWithServiceName,
} from './discovery-assertion.helpers';
export { PublishedEvent } from './published-event.interface';
export { SavedOutboxEvent } from './saved-outbox-event.interface';
