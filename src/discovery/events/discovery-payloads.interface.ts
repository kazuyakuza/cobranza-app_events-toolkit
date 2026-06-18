import { ServiceManifestDto } from '../dto/service-manifest.dto';

/** Platform event payload constants. */
export const PLATFORM_COMPANY_ID = '00000000-0000-0000-0000-000000000000';
export const PLATFORM_ACTOR_ID = 'platform-discovery';

/** Payload for `platform.service.heartbeat.v1` events. */
export interface ServiceHeartbeatPayload {
  /** Service name. */
  name: string;
  /** Service version. */
  version: string;
  /** Unique instance identifier. */
  instanceId: string;
  /** ISO 8601 timestamp of this heartbeat. */
  timestamp: string;
  /** Full manifest, included when `includeFullManifestInHeartbeat` is true. */
  manifest?: ServiceManifestDto;
}

/** Payload for `platform.service.shutdown.v1` events. */
export interface ServiceShutdownPayload {
  /** Service name. */
  name: string;
  /** Service version. */
  version: string;
  /** Unique instance identifier. */
  instanceId: string;
  /** ISO 8601 timestamp of shutdown. */
  timestamp: string;
  /** Optional shutdown reason. */
  reason?: string;
}
