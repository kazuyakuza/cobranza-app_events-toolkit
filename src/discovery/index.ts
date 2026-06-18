/**
 * @packageDocumentation
 * Discovery module — service manifest registration, heartbeat, and schema generation for event discovery.
 */

export { DiscoveryModule, DiscoveryModuleOptions } from './discovery.module';
export { DiscoveryService } from './discovery.service';
export { DISCOVERY_MODULE_OPTIONS, EventsToolkitDiscoveryOptions } from './discovery-service-options.interface';

// Event publishers and platform event types
export { DiscoveryEventPublisher } from './events/discovery-event-publisher.service';
export {
  PLATFORM_REGISTER_SUBJECT,
  PLATFORM_HEARTBEAT_SUBJECT,
  PLATFORM_SHUTDOWN_SUBJECT,
} from './events/platform-event-subjects';
export { PlatformEventType } from './events/platform-event-types';
export type { ServiceHeartbeatPayload, ServiceShutdownPayload } from './events/discovery-payloads.interface';
export { ManifestService } from './manifest.service';
export { ManifestEntryBuilder } from './manifest-entry.builder';
export { ServiceManifestDto, ManifestConsumeEntry, ManifestProduceEntry, ManifestEntryBase } from './dto';
export { ServiceInfo } from './service-info.interface';
export { ServiceInfoOverrides } from './service-info-overrides.interface';
export { resolveServiceInfo } from './service-info.resolver';
export { readPackageInfo, PackageInfo } from './package-info-reader.utils';
export { MANIFEST_SERVICE_DEPS_TOKEN, ManifestServiceDeps } from './manifest-deps.interface';

// Schema generation utilities
export { SchemaGenerator } from './utils/schema-generator';
export { SchemaPersister } from './utils/schema-persister';
export {
  SchemaGeneratorOptions,
  ResolvedSchemaGeneratorOptions,
  DEFAULT_SCHEMA_GENERATOR_OPTIONS,
} from './utils/schema-generator-options.interface';
export type {
  JsonSchemaObject,
  SchemaCollection,
  SchemaManifest,
  SchemaManifestEntry,
} from './utils/schema-types.interface';
