import { DynamicModule, Provider, Type } from '@nestjs/common';
import { ProducerService } from '../producer/producer.service';
import { ConsumerService } from '../consumer/consumer.service';
import { OutboxService } from '../outbox/outbox.service';
import { IdempotencyService } from '../idempotency/idempotency.service';
import { RequestReplyService } from '../request-reply/request-reply.service';
import { EventLoggerService } from '../logging/event-logger.service';
import { ManifestService } from '../discovery/manifest.service';
import { DiscoveryService } from '../discovery/discovery.service';
import { DiscoveryEventPublisher } from '../discovery/events/discovery-event-publisher.service';
import { ServiceInfo } from '../discovery/service-info.interface';
import { MockProducerService } from './mock-producer.service';
import { MockConsumerService } from './mock-consumer.service';
import { MockEventLoggerService } from './mock-event-logger.service';
import { MockOutboxService } from './mock-outbox.service';
import { MockIdempotencyService } from './mock-idempotency.service';
import { MockRequestReplyService } from './mock-request-reply.service';
import { MockManifestService } from './mock-manifest.service';
import { MockDiscoveryService, MockDiscoveryServiceDeps } from './mock-discovery.service';
import { MockDiscoveryEventPublisher } from './mock-discovery-event-publisher.service';
import { EventsToolkitTestModuleOptions } from './events-toolkit-test-options.interface';

/**
 * NestJS dynamic module that registers mock services for all events-toolkit subsystems.
 *
 * Uses `useExisting` to alias each mock as its real service token, so application
 * code receives mocks transparently without any import changes.
 *
 * @example
 * ```typescript
 * // With discovery mocks enabled (default):
 * const module = await Test.createTestingModule({
 *   imports: [EventsToolkitTestModule.forRoot()],
 *   providers: [MyService],
 * }).compile();
 *
 * // With discovery disabled:
 * const module = await Test.createTestingModule({
 *   imports: [EventsToolkitTestModule.forRoot({ discovery: { enabled: false } })],
 *   providers: [MyService],
 * }).compile();
 *
 * // With idempotency mock disabled:
 * const module = await Test.createTestingModule({
 *   imports: [EventsToolkitTestModule.forRoot({ idempotency: { enabled: false } })],
 *   providers: [MyService],
 * }).compile();
 * ```
 *
 * @see {@link MockIdempotencyService} for the idempotency mock implementation.
 * @see {@link EventsToolkitTestModuleOptions} for all configuration options.
 */
export class EventsToolkitTestModule {
  /**
   * Creates a global dynamic module with all mock service providers.
   * @param options - Configuration for which mock subsystems to include.
   * @returns A DynamicModule that exports both mock and real service tokens.
   */
  static forRoot(options?: EventsToolkitTestModuleOptions): DynamicModule {
    const discoveryEnabled = options?.discovery?.enabled !== false;
    return {
      module: EventsToolkitTestModule,
      global: true,
      providers: this.buildProviders(discoveryEnabled, options),
      exports: this.buildExports(discoveryEnabled, options),
    };
  }

  private static buildProviders(discoveryEnabled: boolean, options?: EventsToolkitTestModuleOptions): Provider[] {
    const providers: Provider[] = [
      MockProducerService,
      { provide: ProducerService, useExisting: MockProducerService },
      MockConsumerService,
      { provide: ConsumerService, useExisting: MockConsumerService },
      MockEventLoggerService,
      { provide: EventLoggerService, useExisting: MockEventLoggerService },
      MockOutboxService,
      { provide: OutboxService, useExisting: MockOutboxService },
      MockRequestReplyService,
      { provide: RequestReplyService, useExisting: MockRequestReplyService },
    ];
    if (options?.idempotency?.enabled !== false) {
      providers.push(...this.buildIdempotencyProviders());
    }
    if (discoveryEnabled) {
      providers.push(...this.buildDiscoveryProviders(options));
    }
    return providers;
  }

  /**
   * Registers {@link MockIdempotencyService} and aliases it as `IdempotencyService`
   * so that any application code injecting `IdempotencyService` receives the mock.
   *
   * @see {@link MockIdempotencyService} for the mock implementation details.
   */
  private static buildIdempotencyProviders(): Provider[] {
    return [MockIdempotencyService, { provide: IdempotencyService, useExisting: MockIdempotencyService }];
  }

  private static buildDiscoveryProviders(options?: EventsToolkitTestModuleOptions): Provider[] {
    return [
      MockManifestService,
      { provide: ManifestService, useExisting: MockManifestService },
      MockDiscoveryEventPublisher,
      { provide: DiscoveryEventPublisher, useExisting: MockDiscoveryEventPublisher },
      this.buildMockDiscoveryServiceProvider(options),
      { provide: DiscoveryService, useExisting: MockDiscoveryService },
    ];
  }

  private static buildMockDiscoveryServiceProvider(options?: EventsToolkitTestModuleOptions): Provider {
    return {
      provide: MockDiscoveryService,
      useFactory: this.buildMockDiscoveryServiceFactory(options?.discovery?.serviceInfo),
      inject: [MockManifestService, MockDiscoveryEventPublisher],
    };
  }

  private static buildMockDiscoveryServiceFactory(serviceInfo?: ServiceInfo) {
    return (manifestService: MockManifestService, eventPublisher: MockDiscoveryEventPublisher) => {
      const deps: MockDiscoveryServiceDeps = { manifestService, eventPublisher };
      return new MockDiscoveryService(deps, { enabled: true, serviceInfo });
    };
  }

  private static buildExports(discoveryEnabled: boolean, options?: EventsToolkitTestModuleOptions): Type<unknown>[] {
    const exports: Type<unknown>[] = [
      MockProducerService,
      ProducerService,
      MockConsumerService,
      ConsumerService,
      MockEventLoggerService,
      EventLoggerService,
      MockOutboxService,
      OutboxService,
      MockRequestReplyService,
      RequestReplyService,
    ];
    if (options?.idempotency?.enabled !== false) {
      exports.push(MockIdempotencyService, IdempotencyService);
    }
    if (discoveryEnabled) {
      exports.push(MockManifestService, ManifestService);
      exports.push(MockDiscoveryService, DiscoveryService);
      exports.push(MockDiscoveryEventPublisher, DiscoveryEventPublisher);
    }
    return exports;
  }
}
