# Task 3: Auto-generation of JSON Schemas from DTOs — Code Review Fix Plan

**Date**: 2026-06-18
**Branch**: `feat/event-discovery-module`
**Source Plan**: `.kilo/plans/20260617-task3-schema-generation.md`

---

## Issues Found

### 1. Max indentation depth violations in `schema-generator.ts`

**Severity**: High
**Rule**: Max 2 indentation levels per method/function body.

The following methods contain a 3rd level of nesting (`for` -> `if` or `for` -> body with nested statements):

- **`extractSchemaRefs`** (`src/discovery/utils/schema-generator.ts:72-81`)
  - `for` loop body at level 2, `if` statement at level 3.
- **`filterSchemas`** (`src/discovery/utils/schema-generator.ts:84-92`)
  - `for` loop body at level 2, `if` statement at level 3, assignment inside `if` at level 3/4.
- **`loadSchemasFromDisk`** (`src/discovery/utils/schema-generator.ts:104-114`)
  - `for` loop body at level 2, `const` and `if` statements at level 3.

**Fix**: Refactor these methods to use array transformation methods (`map`, `filter`, `Object.fromEntries`) or extract nested loops into helper methods that themselves comply with the 2-level limit.

---

### 2. Max parameters violation in `DiscoveryService` constructor

**Severity**: High
**Rule**: Max 2 params per method/function; encapsulate extras in an object.

- **`DiscoveryService.constructor`** (`src/discovery/discovery.service.ts:18-24`)
  - Accepts 3 parameters: `options`, `manifestService`, `schemaGenerator`.

**Fix**: Inject `DISCOVERY_MODULE_OPTIONS` as a class property using `@Inject(...)` instead of a constructor parameter, reducing the constructor to 2 parameters (`manifestService` and `schemaGenerator`).

---

### 3. `SchemaGenerator.generateSchema` writes schema file but does not update the manifest

**Severity**: High
**Correctness**: The manifest index becomes stale.

- **`generateSchema`** (`src/discovery/utils/schema-generator.ts:33-40`)
  - Calls `SchemaPersister.persistSchema`, which only writes the individual `{name}.json` file and returns an entry.
  - It never reads/writes `schema-manifest.json`, so `loadSchemasFromDisk` and `getAllSchemas` will not discover the newly persisted schema.

**Fix**: In `generateSchema`, after persisting the file, read the current manifest (or start empty), add/update the entry for this schema, and write the manifest back. Also update the in-memory cache entry.

---

### 4. `SchemaGenerator.generateAllSchemas` is public but does not persist or cache

**Severity**: Medium
**Correctness/API consistency**

- **`generateAllSchemas`** (`src/discovery/utils/schema-generator.ts:43-50`)
  - Public method returns all generated schemas but neither persists them nor updates the cache.
  - Subsequent calls to `getAllSchemas` read from disk and may return stale or empty data.

**Fix**: Make `generateAllSchemas` a `private` helper used internally by `generateSchemasForManifest` and `generateSchema`. This keeps the public surface small and avoids misleading consumers into thinking generated schemas are persisted/cached.

---

### 5. `SchemaPersister` file operations lack error handling

**Severity**: Medium
**Requirement**: File persistence must be robust (handles missing dirs, errors, etc.).

- **`readSchema`** (`src/discovery/utils/schema-persister.ts:40-44`)
  - `JSON.parse` can throw on corrupted JSON.
- **`readManifest`** (`src/discovery/utils/schema-persister.ts:47-51`)
  - `JSON.parse` can throw on corrupted JSON.
- **`persistSchema` / `writeManifest`** (`src/discovery/utils/schema-persister.ts:32-37`, `71-78`)
  - `writeFileSync` can throw on permission errors or full disk.

**Fix**: Wrap read/write/parse operations in `try/catch` blocks and throw descriptive, domain-specific errors (e.g., `SchemaPersistenceError`). For reads, return `undefined` or throw a clear error depending on whether corruption is considered a hard failure.

---

### 6. `package.json` dependency placement

**Severity**: Low
**Correctness**: Build/test reliability

- **`class-validator-jsonschema`** (`package.json:48`)
  - Added to `peerDependencies` only. For library development and tests, it should also be present in `devDependencies` so it is installed during `npm install` without relying on peer-dependency auto-install behavior.
- **Stray `@types/*` packages** (`package.json:52-55`)
  - `@types/babel__generator`, `@types/babel__template`, `@types/istanbul-lib-report`, `@types/yargs-parser` are listed under `dependencies` but appear unrelated to runtime. These should be reviewed and removed if accidentally added.

**Fix**: Add `class-validator-jsonschema` to `devDependencies`. Remove or relocate unrelated `@types/*` packages if they are not intentional runtime dependencies.

---

## Fix Implementation Steps

### Step 1 — Fix `schema-generator.ts` indentation violations

Refactor the three violating methods to stay within 2 indentation levels.

Example refactors:

```typescript
private extractSchemaRefs(manifest: ServiceManifestDto): Set<string> {
  const allEntries = [...manifest.consumes, ...manifest.produces];
  const refs = allEntries
    .map((entry) => entry.payloadSchemaRef)
    .filter((ref): ref is string => Boolean(ref));
  return new Set(refs);
}

private filterSchemas(schemas: SchemaCollection, refs: Set<string>): SchemaCollection {
  const filteredEntries = Object.entries(schemas).filter(([name]) => refs.has(name));
  return Object.fromEntries(filteredEntries);
}

private loadSchemasFromDisk(): SchemaCollection {
  const manifest = this.persister.readManifest();
  if (!manifest) return {};
  const entries = Object.keys(manifest.schemas)
    .map((name) => [name, this.persister.readSchema(name)] as const)
    .filter(([, schema]) => Boolean(schema));
  const result = Object.fromEntries(entries) as SchemaCollection;
  this.schemaCache = result;
  return result;
}
```

**Commit**: `fix(schema-generator): keep indentation within 2 levels`

---

### Step 2 — Fix `DiscoveryService` constructor parameter count

Change options injection from constructor parameter to property injection:

```typescript
@Injectable()
export class DiscoveryService implements OnModuleInit {
  @Inject(DISCOVERY_MODULE_OPTIONS)
  private readonly resolvedOptions: DiscoveryModuleOptions;

  @Optional()
  @Inject(EventLoggerService)
  private readonly logger: EventLoggerService | undefined;

  constructor(
    private readonly manifestService: ManifestService,
    private readonly schemaGenerator: SchemaGenerator,
  ) {}

  // ...
}
```

**Commit**: `fix(discovery-service): reduce constructor params to 2`

---

### Step 3 — Fix `generateSchema` manifest update and cache

Update `generateSchema` to keep the manifest and cache consistent:

```typescript
generateSchema(schemaName: string): JsonSchemaObject | undefined {
  const all = this.generateAllSchemas();
  const raw = all[schemaName];
  if (!raw) return undefined;
  const enriched = this.enrichSchema(raw, schemaName);
  const entry = this.persister.persistSchema({ name: schemaName, schema: enriched });
  this.updateManifestEntry(schemaName, entry);
  if (!this.schemaCache) this.schemaCache = {};
  this.schemaCache[schemaName] = enriched;
  return enriched;
}

private updateManifestEntry(name: string, entry: SchemaManifestEntry): void {
  const manifest = this.persister.readManifest() ?? this.createEmptyManifest();
  const updatedSchemas = { ...manifest.schemas, [name]: entry };
  this.persister.writeManifest({ ...manifest, schemas: updatedSchemas });
}

private createEmptyManifest(): SchemaManifest {
  return {
    generatedAt: new Date().toISOString(),
    schemaDir: this.options.schemaDir,
    schemas: {},
  };
}
```

**Note**: `SchemaPersister.writeManifest` is currently private. It must be made package-visible (`public`) or a new public method `updateManifest(schemas)` must be added.

**Commit**: `fix(schema-generator): update manifest and cache in generateSchema`

---

### Step 4 — Make `generateAllSchemas` private

Change `generateAllSchemas` from `public` to `private`. It remains the internal source for full schema generation.

```typescript
private generateAllSchemas(): SchemaCollection {
  const raw = validationMetadatasToSchemas() as Record<string, Record<string, unknown>>;
  const result: SchemaCollection = {};
  for (const [name, schema] of Object.entries(raw)) {
    result[name] = this.enrichSchema(schema, name);
  }
  return result;
}
```

**Commit**: `refactor(schema-generator): make generateAllSchemas private`

---

### Step 5 — Add error handling to `SchemaPersister`

Introduce a small custom error class (or use `Error`) and guard file I/O:

```typescript
private readJsonFile<T>(filePath: string): T | undefined {
  if (!existsSync(filePath)) return undefined;
  try {
    return JSON.parse(readFileSync(filePath, 'utf-8')) as T;
  } catch (error) {
    throw new Error(`Failed to parse schema file ${filePath}: ${(error as Error).message}`);
  }
}

private writeJsonFile(filePath: string, content: unknown): void {
  try {
    writeFileSync(filePath, JSON.stringify(content, null, 2), 'utf-8');
  } catch (error) {
    throw new Error(`Failed to write schema file ${filePath}: ${(error as Error).message}`);
  }
}
```

Use these helpers in `readSchema`, `readManifest`, `persistSchema`, and `writeManifest`.

**Commit**: `fix(schema-persister): wrap file io in error handling`

---

### Step 6 — Update `package.json` dependencies

- Add `class-validator-jsonschema` to `devDependencies`:

```json
"devDependencies": {
  "class-validator-jsonschema": "^5.0.0"
}
```

- Review and remove the following from `dependencies` if they are not intentional:
  - `@types/babel__generator`
  - `@types/babel__template`
  - `@types/istanbul-lib-report`
  - `@types/yargs-parser`

**Commit**: `chore(package): add class-validator-jsonschema to devDependencies and clean stray @types deps`

---

## Verification Steps

After applying fixes:

1. Run `npm run typecheck` — must pass with no errors.
2. Run `npm run lint` — must pass.
3. Run `npm test` — existing tests must pass.
4. Re-verify rule compliance manually:
   - No method exceeds 50 lines.
   - No file exceeds 200 lines.
   - No method exceeds 2 params.
   - No method exceeds 2 indentation levels.
5. Re-verify `generateSchema` updates `schema-manifest.json` and cache.
6. Re-verify `SchemaPersister` handles missing dirs and I/O/parse errors gracefully.

---

## Summary

| Issue | Severity | File(s) |
|---|---|---|
| Max indentation depth violations | High | `src/discovery/utils/schema-generator.ts` |
| Constructor >2 params | High | `src/discovery/discovery.service.ts` |
| `generateSchema` does not update manifest | High | `src/discovery/utils/schema-generator.ts` |
| `generateAllSchemas` public but no persist/cache | Medium | `src/discovery/utils/schema-generator.ts` |
| File I/O lacks error handling | Medium | `src/discovery/utils/schema-persister.ts` |
| Dependency placement/cleanup | Low | `package.json` |
