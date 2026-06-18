/** Discovery subsystem configuration for EventsToolkitModule. */
export interface EventsToolkitDiscoveryOptions {
  /** Enable the discovery subsystem. Default: true. */
  enabled?: boolean;
  /** Register service manifest on application startup. Default: true. */
  registerOnStartup?: boolean;
  /** Heartbeat interval in minutes. 0 = disabled, >0 = interval. Default: 0. */
  heartbeatIntervalMinutes?: number;
  /** Include full manifest payload in heartbeat messages. Default: false. */
  includeFullManifestInHeartbeat?: boolean;
}

/** Injection token for DiscoveryModule resolved options. */
export const DISCOVERY_MODULE_OPTIONS = 'DISCOVERY_MODULE_OPTIONS';
