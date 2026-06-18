# Task 3: Auto-generation of JSON Schemas from DTOs — Implementation Plan

**Date**: 2026-06-17
**Branch**: `feat/event-discovery-module`
**Task**: Create `SchemaGenerator` utility to auto-generate JSON Schemas from `class-validator`-decorated DTO classes using `class-validator-jsonschema`, persist schemas to files, support examples, and cache generated schemas.

---

## 1. Research Summary

### `class-validator-jsonschema` API (v5.1.0)

| Function/Decorator | Purpose |
|---|---|
| `validationMetadatasToSchemas(options?)` | Scans all registered `class-validator` metadata from `getMetadataStorage()` and returns `Record<string, SchemaObject>` where keys are class names. This is the **primary API** for schema generation. |
| `@JSONSchema(decoratorArgs)` | Applied to a class or property to merge arbitrary JSON Schema keywords into the generated schema. Supports `description`, `example`, `examples`, `title`, and any custom keyword. Can also take a function `(existingSchema, options) => SchemaObject` for programmatic merging. |
| `convertToJsonSchema(meta, options)` | Converts a single `ValidationMetadata` item. Low-level; not needed for our use case. |
| Options: `classValidatorMetadataStorage`, `classTransformerMetadataStorage`, `additionalConverters`, `refPrefix` | Configuration knobs for `validationMetadatasToSchemas`. |

**Key Insight**: `validationMetadatasToSchemas()` generates schemas for **all** registered `class-validator`-decorated classes at once. We then filter to only those referenced in the manifest. This avoids needing individual DTO class constructor references — we just need the class name strings from `payloadSchemaRef`.

**Example Support**: The `@JSONSchema({ examples: [...] })` decorator, applied at the **class level**, merges `examples` into the generated schema. This is the idiomatic mechanism. No custom decorator is needed.

```typescript
import { JSONSchema } from 'class-validator-jsonschema';

@JSONSchema({
  description: 'Payment proof uploaded event',
  examples: [{ id: 'evt_abc', type: 'payment.proof.uploaded', data: { amount: 100 } }],
})
class PaymentProofUploadedEvent extends EventBase<PaymentProofUploadedData> {
  // ...
}
```

---

## 2. Design Decisions

### 2.1 Dependency: `class-validator-jsonschema`

- Add `class-validator-jsonschema` (v5.1.0) as a **peer dependency** (alongside `class-validator` and `class-transformer`), since consuming microservices must use compatible versions.
- The library's `@JSONSchema` decorator is re-exported from `src/discovery/utils/index.ts` for convenience.

### 2.2 Schema Generation Strategy

- Call `validationMetadatasToSchemas()` once to generate schemas for all decorated classes.
- Filter the result to only schemas whose keys match `payloadSchemaRef` values from the manifest.
- Enrich each schema with `$schema` (Draft-07), proper `title`, and verify `examples` are preserved from `@JSONSchema`.

### 2.3 File Persistence Strategy

- **Default directory**: `.events-toolkit/schemas/` (configurable via `SchemaGeneratorOptions.schemaDir`).
- **Filename format**: `{SchemaName}.json` (e.g., `PaymentProofUploadedEvent.json`).
- **Schema manifest file**: `schema-manifest.json` at the root of `schemaDir`, containing index of all generated schemas with file paths and content hashes.
- All files are formatted with 2-space indentation for human readability.

### 2.4 Caching Strategy

- On `persistAll()`, compute a SHA-256 hash of each schema JSON string.
- Store hashes in `schema-manifest.json`.
- On future generation runs, check if `schema-manifest.json` exists and all referenced schema files exist with matching hashes.
- If hashes match, skip regeneration for that schema (unless `forceRegenerate` is `true`).
- `forceRegenerate` option (default: `false`) bypasses cache and regenerates all schemas.

### 2.5 Example Extraction Mechanism

- Use `class-validator-jsonschema`'s built-in `@JSONSchema` decorator at the class level.
- DTO developers annotate their classes like:
  ```typescript
  @JSONSchema({ examples: [{ ... }, { ... }] })
  class MyDto { ... }
  ```
- The generated schema will include the `examples` key automatically.
- Re-export `JSONSchema` from the discovery utils barrel for easy access.

### 2.6 Integration with Discovery Subsystem

- `SchemaGenerator` is registered as a provider in `DiscoveryModule`.
- `DiscoveryService.onModuleInit()` generates the manifest first, then calls `SchemaGenerator.generateSchemasForManifest(manifest)`.
- Generated schemas are persisted via `SchemaPersister.persistAll(schemas)`.
- The `DiscoveryModuleOptions` gains a new `schemaDir` property (default: `.events-toolkit/schemas`).

---

## 3. File Structure (New Files)

```
src/discovery/utils/
├── schema-generator-options.interface.ts   (~30 lines) — options types
├── schema-generator.ts                    (~150 lines) — core generation logic
├── schema-persister.ts                    (~100 lines) — file I/O persistence
├── schema-types.interface.ts              (~30 lines) — shared type definitions
└── index.ts                               (~12 lines) — barrel exports
```

**Total new files**: 5

---

## 4. Detailed Implementation Steps

### Step 4.1 — Install `class-validator-jsonschema` dependency

**File**: `package.json`

**Action**: Add `class-validator-jsonschema` to `peerDependencies`:

```json
{
  "peerDependencies": {
    "@nestjs/common": "^10.0.0",
    "@nestjs/core": "^10.0.0",
    "@nestjs/microservices": "^10.0.0",
    "class-transformer": "^0.5.0",
    "class-validator": "^0.14.0",
    "class-validator-jsonschema": "^5.0.0",
    "nats": "^2.0.0"
  }
}
```

**Command**: Manual edit + `npm install`.

**Commit**: `chore: add class-validator-jsonschema peer dependency`

---

### Step 4.2 — Create `schema-types.interface.ts`

**File**: `src/discovery/utils/schema-types.interface.ts`

```typescript
/** JSON Schema object structure (Draft-07). */
export interface JsonSchemaObject {
  readonly ['$schema']?: string;
  readonly title?: string;
  readonly type?: string;
  readonly properties?: Record<string, unknown>;
  readonly required?: string[];
  readonly examples?: unknown[];
  readonly description?: string;
  readonly [key: string]: unknown;
}

/** Collection of named JSON Schemas keyed by schema reference name. */
export type SchemaCollection = Record<string, JsonSchemaObject>;

/** Entry in the schema manifest index file. */
export interface SchemaManifestEntry {
  /** Relative filename (e.g., 'PaymentProofUploadedEvent.json'). */
  readonly file: string;
  /** SHA-256 hash of the schema JSON content for cache validation. */
  readonly hash: string;
}

/** Schema manifest file structure persisted to disk. */
export interface SchemaManifest {
  /** ISO 8601 timestamp of when the manifest was generated. */
  readonly generatedAt: string;
  /** Directory path where schema files are stored. */
  readonly schemaDir: string;
  /** Index of schema names to their manifest entries. */
  readonly schemas: Record<string, SchemaManifestEntry>;
}
```

**Lines**: ~30 (within limit)

---

### Step 4.3 — Create `schema-generator-options.interface.ts`

**File**: `src/discovery/utils/schema-generator-options.interface.ts`

```typescript
/** Options for configuring the SchemaGenerator. */
export interface SchemaGeneratorOptions {
  /** Directory path where schema JSON files are persisted. Default: '.events-toolkit/schemas'. */
  readonly schemaDir?: string;
  /** When true, regenerate all schemas even if cached files exist. Default: false. */
  readonly forceRegenerate?: boolean;
  /** JSON Schema draft version URI for $schema references. Default: 'http://json-schema.org/draft-07/schema#'. */
  readonly schemaDraftUri?: string;
}

/** Resolved options with defaults applied. */
export interface ResolvedSchemaGeneratorOptions {
  readonly schemaDir: string;
  readonly forceRegenerate: boolean;
  readonly schemaDraftUri: string;
}

/** Default option values. */
export const DEFAULT_SCHEMA_GENERATOR_OPTIONS: ResolvedSchemaGeneratorOptions = {
  schemaDir: '.events-toolkit/schemas',
  forceRegenerate: false,
  schemaDraftUri: 'http://json-schema.org/draft-07/schema#',
};
```

**Lines**: ~25 (within limit)

---

### Step 4.4 — Create `schema-persister.ts`

**File**: `src/discovery/utils/schema-persister.ts`

Responsibilities:
- Ensure schema directory exists (`mkdirSync` with `{ recursive: true }`)
- Write individual schema files as formatted JSON
- Write `schema-manifest.json` index file
- Read schema files from disk
- Check schema existence
- Compute content hashes for caching
- Clear all schemas and manifest

```typescript
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import type { SchemaCollection, SchemaManifest, SchemaManifestEntry, JsonSchemaObject } from './schema-types.interface';
import type { ResolvedSchemaGeneratorOptions } from './schema-generator-options.interface';

/** Parameters for persisting a single schema. */
interface PersistSchemaParams {
  readonly name: string;
  readonly schema: JsonSchemaObject;
}

/** Handles reading and writing JSON Schema files to disk. */
export class SchemaPersister {
  private readonly schemaDir: string;

  constructor(options: ResolvedSchemaGeneratorOptions) {
    this.schemaDir = options.schemaDir;
  }

  /** Persist all schemas to disk, writing each to its own file plus a manifest index. */
  persistAll(schemas: SchemaCollection): void {
    this.ensureDir();
    const entries: Record<string, SchemaManifestEntry> = {};
    for (const [name, schema] of Object.entries(schemas)) {
      entries[name] = this.persistSchema({ name, schema });
    }
    this.writeManifest(entries);
  }

  /** Persist a single schema and return its manifest entry. */
  persistSchema(params: PersistSchemaParams): SchemaManifestEntry {
    const content = JSON.stringify(params.schema, null, 2);
    const file = `${params.name}.json`;
    writeFileSync(join(this.schemaDir, file), content, 'utf-8');
    return { file, hash: this.computeHash(content) };
  }

  /** Read a single schema from disk, or undefined if not found. */
  readSchema(name: string): Record<string, unknown> | undefined {
    const filePath = join(this.schemaDir, `${name}.json`);
    if (!existsSync(filePath)) return undefined;
    return JSON.parse(readFileSync(filePath, 'utf-8'));
  }

  /** Read the schema manifest index from disk, or undefined if not found. */
  readManifest(): SchemaManifest | undefined {
    const manifestPath = join(this.schemaDir, 'schema-manifest.json');
    if (!existsSync(manifestPath)) return undefined;
    return JSON.parse(readFileSync(manifestPath, 'utf-8'));
  }

  /** Check whether a schema file exists on disk. */
  schemaExists(name: string): boolean {
    return existsSync(join(this.schemaDir, `${name}.json`));
  }

  /** Delete all schema files and the manifest from disk. */
  clearAll(): void {
    if (existsSync(this.schemaDir)) {
      rmSync(this.schemaDir, { recursive: true, force: true });
    }
  }

  private ensureDir(): void {
    if (!existsSync(this.schemaDir)) {
      mkdirSync(this.schemaDir, { recursive: true });
    }
  }

  private writeManifest(entries: Record<string, SchemaManifestEntry>): void {
    const manifest: SchemaManifest = {
      generatedAt: new Date().toISOString(),
      schemaDir: this.schemaDir,
      schemas: entries,
    };
    writeFileSync(join(this.schemaDir, 'schema-manifest.json'), JSON.stringify(manifest, null, 2), 'utf-8');
  }

  private computeHash(content: string): string {
    return createHash('sha256').update(content).digest('hex').slice(0, 16);
  }
}
```

**Lines**: ~85 (within 200 limit). Uses single object param `PersistSchemaParams` to comply with max-2-params rule.

---

### Step 4.5 — Create `schema-generator.ts`

**File**: `src/discovery/utils/schema-generator.ts`

```typescript
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
```

**Lines**: ~115 (within 200 limit)

**Key Design Points**:
- `generateSchemasForManifest(manifest)` is the main entry point called by `DiscoveryService`.
- `generateSchema(schemaName)` is for generating a single schema on demand.
- `generateAllSchemas()` wraps `validationMetadatasToSchemas()` and enriches each result.
- `getSchema()/getAllSchemas()` reads from cache or disk.
- `forceRegenerateAll(manifest)` clears cache and regenerates.
- `enrichSchema()` adds `$schema` and `title` — `examples` are automatically included from `@JSONSchema`.
- All public methods have ≤2 params (single object param where needed).

---

### Step 4.6 — Create barrel `index.ts`

**File**: `src/discovery/utils/index.ts`

```typescript
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
export type {
  JsonSchemaObject,
  SchemaCollection,
  SchemaManifest,
  SchemaManifestEntry,
} from './schema-types.interface';
```

---

### Step 4.7 — Update `discovery-service-options.interface.ts`

**File**: `src/discovery/discovery-service-options.interface.ts`

Add schema generation options to `EventsToolkitDiscoveryOptions`:

```typescript
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
  /** Service identity metadata for the discovery manifest. */
  service?: ServiceInfo;
  /** Directory path where generated JSON Schemas are persisted. Default: '.events-toolkit/schemas'. */
  schemaDir?: string;
  /** When true, regenerate all schemas on startup even if cached files exist. Default: false. */
  forceRegenerateSchemas?: boolean;
}
```

Also update the `DiscoveryModuleOptions` interface in `discovery.module.ts`:

```typescript
export interface DiscoveryModuleOptions {
  enabled: boolean;
  registerOnStartup: boolean;
  heartbeatIntervalMinutes: number;
  includeFullManifestInHeartbeat: boolean;
  service?: ServiceInfo;
  /** Directory path for schema persistence. */
  schemaDir: string;
  /** Force schema regeneration on startup. */
  forceRegenerateSchemas: boolean;
}
```

And update the `resolveDiscoveryOptions` default resolver and `DEFAULT_DISCOVERY_OPTIONS`:

```typescript
const DEFAULT_DISCOVERY_OPTIONS: DiscoveryModuleOptions = {
  enabled: true,
  registerOnStartup: true,
  heartbeatIntervalMinutes: 0,
  includeFullManifestInHeartbeat: false,
  schemaDir: '.events-toolkit/schemas',
  forceRegenerateSchemas: false,
};

function resolveDiscoveryOptions(userOptions: EventsToolkitDiscoveryOptions): DiscoveryModuleOptions {
  return {
    enabled: userOptions.enabled ?? DEFAULT_DISCOVERY_OPTIONS.enabled,
    registerOnStartup: userOptions.registerOnStartup ?? DEFAULT_DISCOVERY_OPTIONS.registerOnStartup,
    heartbeatIntervalMinutes: userOptions.heartbeatIntervalMinutes ?? DEFAULT_DISCOVERY_OPTIONS.heartbeatIntervalMinutes,
    includeFullManifestInHeartbeat: userOptions.includeFullManifestInHeartbeat ?? DEFAULT_DISCOVERY_OPTIONS.includeFullManifestInHeartbeat,
    service: userOptions.service,
    schemaDir: userOptions.schemaDir ?? DEFAULT_DISCOVERY_OPTIONS.schemaDir,
    forceRegenerateSchemas: userOptions.forceRegenerateSchemas ?? DEFAULT_DISCOVERY_OPTIONS.forceRegenerateSchemas,
  };
}
```

---

### Step 4.8 — Update `discovery.module.ts`

**File**: `src/discovery/discovery.module.ts`

Register `SchemaGenerator` as a provider in both `forRoot` and `forRootAsync`:

```typescript
import { SchemaGenerator } from './utils/schema-generator';

// In forRoot() providers array:
const providers = [
  { provide: DISCOVERY_MODULE_OPTIONS, useValue: resolvedOptions },
  DiscoveryService,
  ManifestService,
  MANIFEST_DEPS_FACTORY,
  SchemaGenerator,   // NEW
];
const exported = [DiscoveryService, ManifestService, SchemaGenerator];  // ADD SchemaGenerator

// Same change in forRootAsync() providers and exports
```

---

### Step 4.9 — Update `discovery.service.ts`

**File**: `src/discovery/discovery.service.ts`

Inject `SchemaGenerator` and trigger schema generation after manifest generation:

```typescript
import { SchemaGenerator } from './utils/schema-generator';

@Injectable()
export class DiscoveryService implements OnModuleInit {
  private readonly resolvedOptions: DiscoveryModuleOptions;

  @Optional()
  @Inject(EventLoggerService)
  private readonly logger: EventLoggerService | undefined;

  constructor(
    @Inject(DISCOVERY_MODULE_OPTIONS) options: DiscoveryModuleOptions,
    private readonly manifestService: ManifestService,
    private readonly schemaGenerator: SchemaGenerator,  // NEW
  ) {
    this.resolvedOptions = options;
  }

  onModuleInit(): void {
    if (!this.resolvedOptions.enabled) return;
    if (!this.resolvedOptions.registerOnStartup) return;
    
    const manifest = this.manifestService.generateManifest(
      this.resolvedOptions.service ?? { name: 'unknown', version: '0.0.0' },
    );
    
    // Generate and persist JSON Schemas for all referenced DTOs
    this.schemaGenerator.generateSchemasForManifest(manifest);
    
    const resolvedLogger = this.logger ?? new EventLoggerService();
    resolvedLogger.logDiscoveryManifest(manifest as unknown as Record<string, unknown>);
    resolvedLogger.logEventEmitted({
      eventId: 'discovery-startup',
      eventType: 'discovery.service.initialized',
      subject: 'discovery.lifecycle',
    });
  }
}
```

---

### Step 4.10 — Update `discovery/index.ts`

**File**: `src/discovery/index.ts`

Add re-exports for new schema utilities:

```typescript
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
```

---

### Step 4.11 — Verify `src/index.ts` picks up new exports

No change needed — `export * from './discovery'` already re-exports everything from the discovery barrel.

---

### Step 4.12 — Update `.gitignore`

Add the default schema output directory to `.gitignore`:

```gitignore
# Generated JSON Schemas
.events-toolkit/
```

---

### Step 4.13 — Create unit test files

**File**: `src/discovery/utils/schema-generator.spec.ts`

Test cases:
1. `generateAllSchemas()` returns schemas for all decorated classes
2. `generateSchemasForManifest()` filters to only manifest-referenced schemas
3. `enrichSchema()` adds `$schema` and `title`
4. `getSchema()` reads from cache and fallbacks to disk
5. Schema files are correctly written to the configured directory
6. `schema-manifest.json` is written with correct structure
7. `forceRegenerateAll()` clears cache and regenerates
8. DTO with `@JSONSchema({ examples: [...] })` has examples in the generated schema

**File**: `src/discovery/utils/schema-persister.spec.ts`

Test cases:
1. `persistAll()` creates directory and files
2. `persistSchema()` writes individual schema file
3. `readSchema()` returns undefined for non-existent schema
4. `readManifest()` returns undefined when no manifest exists
5. `schemaExists()` checks file existence correctly
6. Hash computation is consistent
7. `clearAll()` removes directory

---

### Step 4.14 — Update `project-structure.md`

Add the new `utils` folder under `discovery/`:

```markdown
- discovery/utils/ - Schema generation from DTOs and file persistence (barrel: index.ts)
```

---

## 5. Integration Flow Diagram

```
DiscoveryModule.forRoot(options)
  │
  ├── Registers: DiscoveryService, ManifestService, SchemaGenerator, SchemaPersister
  │
  └── DiscoveryService.onModuleInit()
        │
        ├── ManifestService.generateManifest(serviceInfo)
        │     └── Returns ServiceManifestDto with payloadSchemaRef strings
        │
        ├── SchemaGenerator.generateSchemasForManifest(manifest)
        │     ├── validationMetadatasToSchemas() ──► all class-validator schemas
        │     ├── filterSchemas(all, manifestRefs) ──► only referenced DTOs
        │     ├── enrichSchema() ──► add $schema, title
        │     └── SchemaPersister.persistAll(filtered)
        │           ├── Write {SchemaName}.json for each schema
        │           └── Write schema-manifest.json index
        │
        └── EventLoggerService.logDiscoveryManifest(manifest) ──► existing logging
```

---

## 6. DTO Usage Example

```typescript
import { JSONSchema } from 'class-validator-jsonschema';
import { IsString, IsNumber, IsUUID, IsEnum } from 'class-validator';
import { EventBase } from '@cobranza-apps/events-toolkit';

enum Currency { USD = 'USD', EUR = 'EUR' }

class PaymentProofData {
  @IsUUID()
  paymentAttemptId!: string;

  @IsString()
  fileUrl!: string;

  @IsNumber()
  amount!: number;

  @IsEnum(Currency)
  currency!: string;
}

@JSONSchema({
  description: 'Event emitted when a payment proof is uploaded',
  examples: [
    { id: 'evt_0192abc', type: 'payment.proof.uploaded', data: { paymentAttemptId: '550e8400...', fileUrl: 'https://...', amount: 100.50, currency: 'USD' } },
  ],
})
class PaymentProofUploadedEvent extends EventBase<PaymentProofData> {
  readonly type = 'payment.proof.uploaded';
  readonly version = '1.0.0';
}
```

Generated `PaymentProofUploadedEvent.json`:
```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "PaymentProofUploadedEvent",
  "description": "Event emitted when a payment proof is uploaded",
  "examples": [
    { "id": "evt_0192abc", "type": "payment.proof.uploaded", ... }
  ],
  "type": "object",
  "properties": { ... },
  "required": [ ... ]
}
```

---

## 7. Constraints Verification

| Constraint | How Addressed |
|---|---|
| Max 200 lines per src file | Each file designed under 150 lines; `schema-generator.ts` ~115 lines |
| Max 50 lines per method | All methods under 50 lines; largest is `generateSchemasForManifest` at ~8 lines body |
| Max 2 indentation levels | Flat structure; helper methods extracted; early returns |
| Max 2 params per method | `persistSchema({ name, schema })` uses single object param; `generateSchemasForManifest(manifest)` takes 1 param |
| Prefer private members | Only public API methods are public; internal helpers are private |
| Self-documenting code | Descriptive method/variable names; minimal comments |
| No commented-out code | No dead code will be committed |

---

## 8. Dependency Changes Summary

| Package | Change | Version |
|---|---|---|
| `class-validator-jsonschema` | Add to `peerDependencies` | `^5.0.0` |

---

## 9. File Changes Summary

| File | Change Type | Description |
|---|---|---|
| `package.json` | MODIFY | Add `class-validator-jsonschema` to peerDependencies |
| `src/discovery/utils/schema-types.interface.ts` | CREATE | Type definitions for schema objects |
| `src/discovery/utils/schema-generator-options.interface.ts` | CREATE | Options interface with defaults |
| `src/discovery/utils/schema-persister.ts` | CREATE | File I/O persistence class |
| `src/discovery/utils/schema-generator.ts` | CREATE | Core schema generation class |
| `src/discovery/utils/index.ts` | CREATE | Barrel exports for utils |
| `src/discovery/discovery-service-options.interface.ts` | MODIFY | Add `schemaDir` and `forceRegenerateSchemas` |
| `src/discovery/discovery.module.ts` | MODIFY | Register SchemaGenerator, update options, export SchemaGenerator |
| `src/discovery/discovery.service.ts` | MODIFY | Inject SchemaGenerator, call generateSchemasForManifest |
| `src/discovery/index.ts` | MODIFY | Export new types and classes |
| `.gitignore` | MODIFY | Add `.events-toolkit/` |
| `src/discovery/utils/schema-generator.spec.ts` | CREATE | Unit tests for SchemaGenerator |
| `src/discovery/utils/schema-persister.spec.ts` | CREATE | Unit tests for SchemaPersister |
| `.agent/project-structure.md` | MODIFY | Add `discovery/utils/` entry |

---

## 10. Implementation Order

1. **Step 4.1**: Install `class-validator-jsonschema` dependency + commit
2. **Step 4.2**: Create `schema-types.interface.ts`
3. **Step 4.3**: Create `schema-generator-options.interface.ts`
4. **Step 4.4**: Create `schema-persister.ts`
5. **Step 4.5**: Create `schema-generator.ts`
6. **Step 4.6**: Create barrel `index.ts`
7. **Step 4.7**: Update `discovery-service-options.interface.ts` + `discovery.module.ts` options
8. **Step 4.8**: Update `discovery.module.ts` (register + export SchemaGenerator)
9. **Step 4.9**: Update `discovery.service.ts` (inject + call schema generation)
10. **Step 4.10**: Update `discovery/index.ts` exports
11. **Step 4.11**: Verify `src/index.ts` picks up new exports
12. **Step 4.12**: Update `.gitignore`
13. **Step 4.13**: Create unit tests
14. **Step 4.14**: Update `project-structure.md`
15. **Build & typecheck**: Run `npm run typecheck` and `npm run build`
16. **Test**: Run `npm test`

---

## 11. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| `class-validator-jsonschema` version incompatibility with `class-validator` 0.14.x | Pin `^5.0.0` which specifies `class-validator>=0.14.0` as peer dep |
| DTOs not registered with `class-validator` metadata if they're not imported at module init | Document that consuming services must import their DTO classes before calling generate; this is standard `class-validator` behavior |
| File system permissions for writing `.events-toolkit/schemas/` | `SchemaPersister` uses `mkdirSync({ recursive: true })` and logs errors; configurable `schemaDir` allows alternative paths |
| Schema generation fails silently | `SchemaGenerator` methods throw on error; `DiscoveryService` logs errors but does not crash the application |