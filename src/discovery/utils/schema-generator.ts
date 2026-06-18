import { validationMetadatasToSchemas } from 'class-validator-jsonschema';
import type { SchemaCollection, JsonSchemaObject } from './schema-types.interface';
import type { ServiceManifestDto } from '../dto/service-manifest.dto';
import {
  SchemaGeneratorOptions,
  ResolvedSchemaGeneratorOptions,
  DEFAULT_SCHEMA_GENERATOR_OPTIONS,
} from './schema-generator-options.interface';
import { SchemaPersister } from './schema-persister';

/** Generates JSON Schemas from class-validator-decorated DTO classes and persists them to disk. */
export class SchemaGenerator {
  private readonly options: ResolvedSchemaGeneratorOptions;
  private readonly persister: SchemaPersister;
  private schemaCache: SchemaCollection | undefined;

  constructor(options?: SchemaGeneratorOptions) {
    this.options = { ...DEFAULT_SCHEMA_GENERATOR_OPTIONS, ...options };
    this.persister = new SchemaPersister(this.options);
  }

  /** Generate JSON Schemas for all DTOs referenced in a service manifest. */
  generateSchemasForManifest(manifest: ServiceManifestDto): SchemaCollection {
    const schemaRefs = this.extractSchemaRefs(manifest);
    const allSchemas = this.generateAllSchemas();
    const filtered = this.filterSchemas(allSchemas, schemaRefs);
    this.persister.persistAll(filtered);
    this.schemaCache = filtered;
    return filtered;
  }

  /** Generate a single named schema by class name. */
  generateSchema(schemaName: string): JsonSchemaObject | undefined {
    const all = this.generateAllSchemas();
    const raw = all[schemaName];
    if (!raw) return undefined;
    const enriched = this.enrichSchema(raw, schemaName);
    this.persister.persistSchema({ name: schemaName, schema: enriched });
    return enriched;
  }

  /** Generate JSON Schemas for all registered class-validator decorated classes. */
  generateAllSchemas(): SchemaCollection {
    const raw = validationMetadatasToSchemas() as Record<string, Record<string, unknown>>;
    const result: SchemaCollection = {};
    for (const [name, schema] of Object.entries(raw)) {
      result[name] = this.enrichSchema(schema, name);
    }
    return result;
  }

  /** Get a previously generated schema from cache, or read from disk. */
  getSchema(name: string): JsonSchemaObject | undefined {
    if (this.schemaCache?.[name]) return this.schemaCache[name];
    return this.persister.readSchema(name) as JsonSchemaObject | undefined;
  }

  /** Get all cached schemas, reading from disk if in-memory cache is empty. */
  getAllSchemas(): SchemaCollection {
    if (this.schemaCache) return this.schemaCache;
    return this.loadSchemasFromDisk();
  }

  /** Force regeneration of all schemas for a given manifest, ignoring cache. */
  forceRegenerateAll(manifest: ServiceManifestDto): SchemaCollection {
    this.persister.clearAll();
    this.schemaCache = undefined;
    return this.generateSchemasForManifest(manifest);
  }

  /** Extract unique payload schema references from a manifest. */
  private extractSchemaRefs(manifest: ServiceManifestDto): Set<string> {
    const refs = new Set<string>();
    for (const entry of manifest.consumes) {
      if (entry.payloadSchemaRef) refs.add(entry.payloadSchemaRef);
    }
    for (const entry of manifest.produces) {
      if (entry.payloadSchemaRef) refs.add(entry.payloadSchemaRef);
    }
    return refs;
  }

  /** Filter schemas to only those matching the given schema references. */
  private filterSchemas(schemas: SchemaCollection, refs: Set<string>): SchemaCollection {
    const filtered: SchemaCollection = {};
    for (const [name, schema] of Object.entries(schemas)) {
      if (refs.has(name)) {
        filtered[name] = schema;
      }
    }
    return filtered;
  }

  /** Enrich a raw JSON Schema with $schema header and title. */
  private enrichSchema(schema: Record<string, unknown>, name: string): JsonSchemaObject {
    return {
      $schema: this.options.schemaDraftUri,
      title: name,
      ...schema,
    } as JsonSchemaObject;
  }

  /** Load all schemas from disk by reading the manifest index. */
  private loadSchemasFromDisk(): SchemaCollection {
    const manifest = this.persister.readManifest();
    if (!manifest) return {};
    const result: SchemaCollection = {};
    for (const name of Object.keys(manifest.schemas)) {
      const schema = this.persister.readSchema(name) as JsonSchemaObject | undefined;
      if (schema) result[name] = schema;
    }
    this.schemaCache = result;
    return result;
  }
}
