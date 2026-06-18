import { ManifestConsumeEntry } from './manifest-consume-entry.dto';
import { ManifestProduceEntry } from './manifest-produce-entry.dto';

/** Complete service manifest describing a microservice's event contract. */
export interface ServiceManifestDto {
  /** Service name (e.g., 'payment-service'). */
  name: string;
  /** Service version (e.g., '1.0.0'). */
  version: string;
  /** Human-readable description of the service. */
  description: string;
  /** Unique instance identifier for this service process. */
  instanceId: string;
  /** Events and request-reply responses this service consumes. */
  consumes: ManifestConsumeEntry[];
  /** Events this service produces/emits. */
  produces: ManifestProduceEntry[];
}
