import { ServiceInfo } from '../discovery/service-info.interface';

/** Configuration for discovery mocks in the test module. */
export interface DiscoveryTestOptions {
  /** Whether to register discovery mock services. Default: true. */
  enabled?: boolean;
  /** Service identity used by MockManifestService when generating manifests. */
  serviceInfo?: ServiceInfo;
}

/**
 * Configuration for idempotency mocks in the test module.
 *
 * @see {@link MockIdempotencyService} for the mock implementation.
 */
export interface IdempotencyTestOptions {
  /** Whether to register idempotency mock services. Default: `true`. */
  enabled?: boolean;
}

/**
 * Options for {@link EventsToolkitTestModule.forRoot}.
 *
 * @see {@link MockIdempotencyService} for the idempotency mock.
 * @see {@link MockDiscoveryService} for the discovery mock.
 */
export interface EventsToolkitTestModuleOptions {
  /** Discovery mock configuration. Omit for defaults (enabled: `true`). */
  discovery?: DiscoveryTestOptions;
  /**
   * Idempotency mock configuration. Omit for defaults (enabled: `true`).
   * When enabled, {@link MockIdempotencyService} is registered and aliased as
   * `IdempotencyService` so application code receives the mock transparently.
   */
  idempotency?: IdempotencyTestOptions;
}
