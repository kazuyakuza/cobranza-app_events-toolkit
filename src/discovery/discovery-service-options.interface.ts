import { ServiceInfoOverrides } from './service-info-overrides.interface';

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
  /** Service identity overrides for the discovery manifest. Auto-resolved from package.json if omitted. */
  service?: ServiceInfoOverrides;
  /** Directory path where generated JSON Schemas are persisted. Default: '.events-toolkit/schemas'. */
  schemaDir?: string;
  /** When true, regenerate all schemas on startup even if cached files exist. Default: false. */
  forceRegenerateSchemas?: boolean;
  /** Capabilities advertised in the service manifest (e.g. 'idempotency', 'outbox').
   *  Typically populated automatically by EventsToolkitModule; pass manually only when
   *  registering DiscoveryModule standalone with custom capabilities. */
  capabilities?: string[];
}

/** Injection token for DiscoveryModule resolved options. */
export const DISCOVERY_MODULE_OPTIONS = 'DISCOVERY_MODULE_OPTIONS';
