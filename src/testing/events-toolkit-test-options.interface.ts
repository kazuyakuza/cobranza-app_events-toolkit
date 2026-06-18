import { ServiceInfo } from '../discovery/service-info.interface';

/** Configuration for discovery mocks in the test module. */
export interface DiscoveryTestOptions {
  /** Whether to register discovery mock services. Default: true. */
  enabled?: boolean;
  /** Service identity used by MockManifestService when generating manifests. */
  serviceInfo?: ServiceInfo;
}

/** Options for EventsToolkitTestModule.forRoot(). */
export interface EventsToolkitTestModuleOptions {
  /** Discovery mock configuration. Omit for defaults (enabled: true). */
  discovery?: DiscoveryTestOptions;
}
