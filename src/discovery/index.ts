/**
 * @packageDocumentation
 * Discovery module — service manifest registration, heartbeat, and schema generation for event discovery.
 */

export { DiscoveryModule, DiscoveryModuleOptions } from './discovery.module';
export { DiscoveryService } from './discovery.service';
export { DISCOVERY_MODULE_OPTIONS, EventsToolkitDiscoveryOptions } from './discovery-service-options.interface';
export { ManifestService } from './manifest.service';
export { ServiceManifestDto, ManifestConsumeEntry, ManifestProduceEntry, ManifestEntryBase } from './dto';
export { ServiceInfo } from './service-info.interface';
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
