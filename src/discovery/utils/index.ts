/**
 * @packageDocumentation
 * Schema generation and persistence utilities for JSON Schema auto-generation from DTOs.
 */

export { SchemaGenerator } from './schema-generator';
export { SchemaPersister } from './schema-persister';
export {
  SchemaGeneratorOptions,
  ResolvedSchemaGeneratorOptions,
  DEFAULT_SCHEMA_GENERATOR_OPTIONS,
} from './schema-generator-options.interface';
export type { JsonSchemaObject, SchemaCollection, SchemaManifest, SchemaManifestEntry } from './schema-types.interface';
