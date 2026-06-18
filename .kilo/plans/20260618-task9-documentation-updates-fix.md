# Task 9 — Documentation Updates Fix Plan

## Review Outcome

Issues were found in the documentation produced during Task 9 4.2. The documentation is largely accurate and covers the required acceptance criteria, but several inaccuracies relative to the current implementation need correction.

## Issues Found

### 1. Platform heartbeat/shutdown payload examples omit `timestamp`

- **Severity**: Medium
- **File**: `docs/event-discovery-and-service-registry.md`
- **Details**: The `platform.service.heartbeat.v1` and `platform.service.shutdown.v1` payload examples only show `name`, `version`, and `instanceId` inside `data`. The implementation (`src/discovery/events/discovery-event-publisher.service.ts`) always injects a `timestamp: nowIso()` field into both payloads. The examples should include `timestamp` to match the actual envelope.

### 2. Schema generation timing is documented incorrectly

- **Severity**: Medium
- **File**: `docs/event-discovery-and-service-registry.md`
- **Details**: The "Schema Auto-Generation from DTOs" section states that `generateSchemasForManifest(manifest)` is called "On module init (or first access)". The implementation only calls it in `DiscoveryService.onModuleInit()` when `registerOnStartup: true`. If `registerOnStartup: false`, neither the manifest nor schemas are generated on first HTTP access; `GET /discovery/schemas` returns only cached or previously persisted schemas. The wording should be corrected to "on module init when `registerOnStartup: true`".

### 3. `payloadSchemaRef` auto-resolution example implies `Promise<T>` unwrapping

- **Severity**: Medium
- **File**: `docs/event-discovery-and-service-registry.md`
- **Details**: The "Without explicit `payloadSchemaRef`" example uses an `async` method returning `Promise<PaymentProofUploadedData>` and claims the resolved reference is `PaymentProofUploadedData`. TypeScript's `design:returntype` metadata returns the `Promise` constructor for async methods; `ManifestEntryBuilder.extractClassName` does not unwrap generics, so the resolved name would be `Promise` (unless `Promise` is later added to `GENERIC_WRAPPER_TYPES`). Either use a synchronous method in the example or add a clear note that async methods should provide an explicit `payloadSchemaRef` because reflect metadata does not unwrap `Promise<T>`.

### 4. SHA-256 hashes are not used for write cache validation

- **Severity**: Low
- **File**: `docs/event-discovery-and-service-registry.md`
- **Details**: The `SchemaPersister` table claims "Cache validation: Uses SHA-256 hashes to detect changes and avoid unnecessary writes". The implementation computes and stores a truncated SHA-256 hash in `schema-manifest.json`, but `persistSchema()` always calls `writeJsonFile()` regardless of the existing hash. The documentation should describe the hash as stored metadata for change tracking/validation rather than as a mechanism that currently avoids writes.

### 5. README architecture tree omits the `discovery/` module

- **Severity**: Low
- **File**: `README.md`
- **Details**: The "Architecture" `src/` tree does not include the new `discovery/` folder. It should be added so the README structure matches the codebase.

## Fix Plan

1. Update `docs/event-discovery-and-service-registry.md`:
   - Add `"timestamp": "2026-06-18T01:35:00.000Z"` to the `platform.service.heartbeat.v1` payload example.
   - Add `"timestamp": "2026-06-18T02:00:00.000Z"` to the `platform.service.shutdown.v1` payload example.
   - In the "Schema Auto-Generation from DTOs" section, change "On module init (or first access)" to "On module init when `registerOnStartup` is `true`".
   - In the `payloadSchemaRef` auto-resolution example, either:
     - replace the async method with a synchronous method returning `PaymentProofUploadedData`, or
     - keep the async example but add a note that reflect metadata cannot unwrap `Promise<T>`, so explicit `payloadSchemaRef` is recommended for async producers/consumers.
   - In the `SchemaPersister` table, replace "Cache validation: Uses SHA-256 hashes to detect changes and avoid unnecessary writes" with "Stores a SHA-256 hash of each schema in `schema-manifest.json` for change tracking and cache validation".

2. Update `README.md`:
   - Add `discovery/` to the `src/` architecture tree, e.g.:
     ```text
     src/
     ...
     ├── discovery/                # Service discovery, manifest generation, schema publishing
     │   ├── dto/                  # Manifest DTOs
     │   ├── events/               # Platform event publisher and subjects
     │   └── utils/                # Schema generator and persister
     ...
     ```

3. Run a final spelling/grammar pass on the three reviewed files.

## Verification

- Re-read the updated payload examples and confirm they match `ServiceHeartbeatPayload` and `ServiceShutdownPayload` in `src/discovery/events/discovery-payloads.interface.ts`.
- Confirm the schema-generation wording matches `DiscoveryService.onModuleInit()` in `src/discovery/discovery.service.ts`.
- Confirm the README architecture tree lists `discovery/` and reflects the actual folder structure under `src/`.
