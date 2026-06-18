# Global Plan — Event Discovery Module

**TODO File:** `.agent/todos/20260617/20260617-todo-0.md`
**Feature Branch:** `feat/event-discovery-module`
**Version Bump:** `0.5.0` → `0.6.0` (minor — new feature)

---

## Pre-Analysis

The Event Discovery system is a new major subsystem for `events-toolkit`. It must:

1. Scan decorators (`@OnEvent`, `@EmitEvent`, `@OnRequestReply`) at startup via NestJS reflection.
2. Build a service manifest containing metadata + `payloadSchemaRef` references.
3. Auto-generate JSON Schemas from `class-validator` decorated DTOs using `class-validator-jsonschema`.
4. Persist manifest and schemas to disk files (not in-memory cache), per user note.
5. Emit platform lifecycle events (`platform.service.register.v1`, `platform.service.heartbeat.v1`, shutdown).
6. Expose HTTP endpoints (`GET /manifest`, `GET /schemas`).
7. Provide testing mocks and helpers.
8. Update documentation.

**Key Constraints & Rules:**
- Max 200 lines per file, max 50 lines per method, max 2 params, max 2 depth.
- Prefer private members, self-documenting code, no commented code.
- All source in `src/`; update `.agent/project-structure.md`.
- `class-validator-jsonschema` is a new dependency.
- No backward-compatibility concerns (lib not yet consumed by external projects).

**Dependency Graph Between Tasks:**
```
Task 1 (Module Setup) ──► Task 2 (Manifest), Task 6 (Registration), Task 7 (Endpoints)
Task 3 (Schema Gen) ────► Task 2 (Manifest), Task 7 (Endpoints)
Task 4 (Decorators) ────► Task 2 (Manifest)
Task 5 (Service Info) ──► Task 2 (Manifest), Task 6 (Registration)
Task 8 (Testing) ───────► depends on all implementation tasks
Task 9 (Docs) ──────────► depends on all implementation tasks
```

---

## Global Execution Order

| # | Step | Sub-agent Type | Notes |
|---|------|---------------|-------|
| 1 | **Step 2 — Git Feature Branch Setup** | implementer | `feat/event-discovery-module` |
| 2 | **Step 3 — Version Update** | implementer | Bump to `0.6.0` |
| 3 | **Task 1: 4.1 Analysis & Planning** | architect | Discovery module structure |
| 4 | **Task 1: 4.2 Implementation** | implementer | `discovery.module.ts`, `discovery.service.ts`, config options |
| 5 | **Task 1: 4.3 Code Review** | code-reviewer | Review Task 1 |
| 6 | **Task 1: 4.3-fix (if needed)** | implementer | Apply fixes |
| 7 | **Task 1: 4.4 Documentation** | docs-specialist | Inline comments, structure doc |
| 8 | **Task 1: 4.5 Verification** | architect | Verify plan adherence |
| 9 | **Task 1: 4.6 Task Completion** | implementer | Mark `[DONE]` |
| 10 | **Task 4: 4.1 Analysis & Planning** | architect | Decorator metadata enhancement |
| 11 | **Task 4: 4.2 Implementation** | implementer | Update `@OnEvent`, `@EmitEvent`, `@OnRequestReply` |
| 12 | **Task 4: 4.3 Code Review** | code-reviewer | Review Task 4 |
| 13 | **Task 4: 4.3-fix (if needed)** | implementer | Apply fixes |
| 14 | **Task 4: 4.4 Documentation** | docs-specialist | Decorator docs |
| 15 | **Task 4: 4.5 Verification** | architect | Verify |
| 16 | **Task 4: 4.6 Task Completion** | implementer | Mark `[DONE]` |
| 17 | **Task 5: 4.1 Analysis & Planning** | architect | Service info extraction strategy |
| 18 | **Task 5: 4.2 Implementation** | implementer | `package.json` reader, `instanceId`, overrides |
| 19 | **Task 5: 4.3 Code Review** | code-reviewer | Review Task 5 |
| 20 | **Task 5: 4.3-fix (if needed)** | implementer | Apply fixes |
| 21 | **Task 5: 4.4 Documentation** | docs-specialist | Inline docs |
| 22 | **Task 5: 4.5 Verification** | architect | Verify |
| 23 | **Task 5: 4.6 Task Completion** | implementer | Mark `[DONE]` |
| 24 | **Task 3: 4.1 Analysis & Planning** | architect | Schema generator design with `class-validator-jsonschema` |
| 25 | **Task 3: 4.2 Implementation** | implementer | `schema-generator.ts`, file-based persistence |
| 26 | **Task 3: 4.3 Code Review** | code-reviewer | Review Task 3 |
| 27 | **Task 3: 4.3-fix (if needed)** | implementer | Apply fixes |
| 28 | **Task 3: 4.4 Documentation** | docs-specialist | Schema gen docs |
| 29 | **Task 3: 4.5 Verification** | architect | Verify |
| 30 | **Task 3: 4.6 Task Completion** | implementer | Mark `[DONE]` |
| 31 | **Task 2: 4.1 Analysis & Planning** | architect | Manifest service design |
| 32 | **Task 2: 4.2 Implementation** | implementer | `service-manifest.dto.ts`, `ManifestService` |
| 33 | **Task 2: 4.3 Code Review** | code-reviewer | Review Task 2 |
| 34 | **Task 2: 4.3-fix (if needed)** | implementer | Apply fixes |
| 35 | **Task 2: 4.4 Documentation** | docs-specialist | Manifest docs |
| 36 | **Task 2: 4.5 Verification** | architect | Verify |
| 37 | **Task 2: 4.6 Task Completion** | implementer | Mark `[DONE]` |
| 38 | **Task 6: 4.1 Analysis & Planning** | architect | Lifecycle event emission design |
| 39 | **Task 6: 4.2 Implementation** | implementer | `OnApplicationBootstrap`, shutdown, heartbeat |
| 40 | **Task 6: 4.3 Code Review** | code-reviewer | Review Task 6 |
| 41 | **Task 6: 4.3-fix (if needed)** | implementer | Apply fixes |
| 42 | **Task 6: 4.4 Documentation** | docs-specialist | Lifecycle docs |
| 43 | **Task 6: 4.5 Verification** | architect | Verify |
| 44 | **Task 6: 4.6 Task Completion** | implementer | Mark `[DONE]` |
| 45 | **Task 7: 4.1 Analysis & Planning** | architect | Controller design |
| 46 | **Task 7: 4.2 Implementation** | implementer | `discovery.controller.ts`, `/manifest`, `/schemas` |
| 47 | **Task 7: 4.3 Code Review** | code-reviewer | Review Task 7 |
| 48 | **Task 7: 4.3-fix (if needed)** | implementer | Apply fixes |
| 49 | **Task 7: 4.4 Documentation** | docs-specialist | Endpoint docs |
| 50 | **Task 7: 4.5 Verification** | architect | Verify |
| 51 | **Task 7: 4.6 Task Completion** | implementer | Mark `[DONE]` |
| 52 | **Task 8: 4.1 Analysis & Planning** | architect | Testing mocks design |
| 53 | **Task 8: 4.2 Implementation** | implementer | `MockManifestService`, `MockDiscoveryService`, test module updates |
| 54 | **Task 8: 4.3 Code Review** | code-reviewer | Review Task 8 |
| 55 | **Task 8: 4.3-fix (if needed)** | implementer | Apply fixes |
| 56 | **Task 8: 4.4 Documentation** | docs-specialist | Testing docs |
| 57 | **Task 8: 4.5 Verification** | architect | Verify |
| 58 | **Task 8: 4.6 Task Completion** | implementer | Mark `[DONE]` |
| 59 | **Task 9: 4.1 Analysis & Planning** | architect | Documentation plan |
| 60 | **Task 9: 4.2 Implementation** | implementer | Write docs, update README, update convention doc |
| 61 | **Task 9: 4.3 Code Review** | code-reviewer | Review Task 9 |
| 62 | **Task 9: 4.3-fix (if needed)** | implementer | Apply fixes |
| 63 | **Task 9: 4.4 Documentation** | docs-specialist | Final doc polish |
| 64 | **Task 9: 4.5 Verification** | architect | Verify |
| 65 | **Task 9: 4.6 Task Completion** | implementer | Mark `[DONE]` |
| 66 | **Step 5 — TODO File Completion** | implementer | Rename with `-DONE`, merge branch, push `main` |

---

## Per-Task Plans

### Task 1 — Discovery Module Setup

**Files to create:**
- `src/discovery/discovery.module.ts` — NestJS DynamicModule with `forRoot()` / `forRootAsync()`.
- `src/discovery/discovery.service.ts` — Orchestrates discovery lifecycle.
- `src/discovery/index.ts` — Barrel export.

**Files to modify:**
- `src/events-toolkit-options.interface.ts` — Add `EventsToolkitDiscoveryOptions` and add `discovery?:` to `EventsToolkitModuleOptions`.
- `src/events-toolkit.module.ts` — Conditionally import `DiscoveryModule` when `discovery?.enabled !== false`.
- `.agent/project-structure.md` — Add `discovery/` folder entry.
- `src/index.ts` — Export `DiscoveryModule` and related symbols.

**Key implementation details:**
- `EventsToolkitDiscoveryOptions`:
  ```ts
  export interface EventsToolkitDiscoveryOptions {
    enabled?: boolean; // default: true
    registerOnStartup?: boolean; // default: true
    heartbeatIntervalMinutes?: number; // 0 = disabled
    includeFullManifestInHeartbeat?: boolean; // default: false
  }
  ```
- `DiscoveryModule.forRoot(options, natsOptions)` receives the discovery config and a `ProducerService` token for emitting platform events.
- `DiscoveryService` is `@Injectable()` and implements `OnApplicationBootstrap`, `OnModuleDestroy`.

---

### Task 2 — Service Manifest & Schema References

**Files to create:**
- `src/discovery/dto/service-manifest.dto.ts` — Manifest DTOs.
- `src/discovery/manifest.service.ts` — Scans decorators and builds manifest.
- `src/discovery/dto/index.ts` — Barrel.

**Files to modify:**
- `src/discovery/index.ts` — Export new symbols.

**Key implementation details:**
- Manifest DTO structure:
  ```ts
  export class EventManifestEntry {
    eventType!: string;
    subjectPattern!: string;
    payloadSchemaRef!: string;
    description?: string;
    version?: string;
    handler?: string;
    tags?: string[];
  }

  export class ServiceManifestDto {
    serviceName!: string;
    serviceVersion!: string;
    description?: string;
    instanceId!: string;
    consumes!: EventManifestEntry[];
    produces!: EventManifestEntry[];
    requestReplies!: EventManifestEntry[];
  }
  ```
- `ManifestService` uses `DiscoveryService` (from `@nestjs/core`) and `Reflector` to scan for `@OnEvent`, `@EmitEvent`, `@OnRequestReply` metadata.
- `payloadSchemaRef` format: `#/components/schemas/{ClassName}` (e.g., `#/components/schemas/PaymentProofUploadedEvent`).
- The `ManifestService` reads the DTO class from decorator metadata (enhanced in Task 4) to determine `payloadSchemaRef`.
- Manifest is persisted to a JSON file on disk (e.g., `.events-toolkit/manifest.json`).

---

### Task 3 — Auto-generation of JSON Schemas from DTOs

**Files to create:**
- `src/discovery/utils/schema-generator.ts` — Core schema generation logic.
- `src/discovery/utils/index.ts` — Barrel.
- `src/discovery/utils/schema-storage.service.ts` — File-based schema persistence.

**Dependencies to add:**
- `class-validator-jsonschema` (runtime dependency).

**Key implementation details:**
- Use `class-validator-jsonschema`'s `validationMetadatasToSchemas()` to convert `class-validator` decorated classes to JSON Schema.
- Create a decorator `@SchemaExample(examples: unknown[])` to attach examples to DTOs.
- Store examples in a metadata key (`SCHEMA_EXAMPLES_METADATA`).
- The `SchemaGenerator`:
  1. Accepts a list of DTO classes.
  2. Calls `validationMetadatasToSchemas()`.
  3. Merges any `@SchemaExample` metadata into `schema.examples`.
  4. Writes the resulting schemas map to `.events-toolkit/schemas.json`.
- `SchemaStorageService` handles read/write of the schemas file.
- The manifest file path and schemas file path should be configurable (default to `.events-toolkit/` in the project root).

---

### Task 4 — Enhance Existing Decorators

**Files to modify:**
- `src/consumer/decorators/on-event.decorator.ts`
- `src/producer/decorators/emit-event.decorator.ts`
- `src/consumer/decorators/on-request-reply.decorator.ts`

**Key implementation details:**
- Extend each options interface:
  ```ts
  export interface OnEventOptions {
    domain: string;
    entity: string;
    action: string;
    version?: string;
    description?: string;
    tags?: string[];
    payloadExample?: Record<string, unknown>;
    payloadClass?: new (...args: unknown[]) => unknown; // DTO class reference
  }
  ```
  Same additions for `EmitEventOptions` and `OnRequestReplyOptions` (with `eventType` instead of domain/entity/action for the latter).
- The `payloadClass` field allows the `ManifestService` to know which DTO class to pass to the `SchemaGenerator`.
- The `payloadExample` field is used for manifest documentation and can also be merged into schema examples.
- Update all existing tests to ensure backward compatibility within the repo.
- Add new unit tests for the extended metadata.

---

### Task 5 — Service Information

**Files to create:**
- `src/discovery/utils/package-reader.ts` — Reads `package.json` for name, version, description.
- `src/discovery/dto/service-info.dto.ts` — `ServiceInfoDto` with fields and optional overrides.

**Files to modify:**
- `src/discovery/discovery.service.ts` — Inject `ServiceInfoDto`.

**Key implementation details:**
- `PackageReader` tries `require('../../../package.json')` (relative to `dist/discovery/utils/package-reader.js` or via `process.cwd()` in dev).
- Safer approach: accept `packageJsonPath` in options; default to `path.join(process.cwd(), 'package.json')`.
- `ServiceInfoDto`:
  ```ts
  export class ServiceInfoDto {
    name!: string;
    version!: string;
    description?: string;
    instanceId!: string;
  }
  ```
- `instanceId` is auto-generated on first read (UUIDv7 or `hostname + timestamp + random`).
- Overrides via `discovery.serviceInfo` in `EventsToolkitModuleOptions`:
  ```ts
  export interface EventsToolkitDiscoveryOptions {
    // ... other fields ...
    serviceInfo?: Partial<ServiceInfoDto>;
    manifestPath?: string;
    schemasPath?: string;
  }
  ```

---

### Task 6 — Automatic Registration Events

**Files to modify:**
- `src/discovery/discovery.service.ts` — Add lifecycle hooks.

**Key implementation details:**
- `OnApplicationBootstrap`:
  - If `registerOnStartup !== false`, emit `platform.service.register.v1` via `ProducerService.emit()`.
  - Payload is a `EventEnvelope<ServiceManifestDto>` with `type = 'platform.service.register.v1'`.
  - Subject: `platform.service.register.v1` (no company_id wildcard needed; use a fixed platform subject or `company.*.platform.service.register.v1` per convention).
  - Wait, the convention says all subjects must have `company.{company_id}`. For platform events, we should use `company.*.platform.service.register.v1` or define a special case. Per the TODO, the subject is `platform.service.register.v1`.
  - Actually, looking at the event-messaging-convention, the format is `company.{company_id}.{domain}.{entity}.{action}.v{version}`. For platform events, domain=`platform`, entity=`service`, action=`register`. So subject: `company.*.platform.service.register.v1` (wildcard for discovery events since they are not tenant-specific).
  - Or we can use a fixed subject `platform.service.register.v1` if the convention allows platform subjects. I'll follow the TODO's wording and use `platform.service.register.v1` as the event type, and the subject will be built accordingly. For the actual NATS subject, I'll use `platform.service.register.v1` directly or via `buildSubject` with a system company ID.
  - Let's keep it simple: use `platform.service.register.v1` as the event type and subject for platform events (this is a documented exception in the convention doc update).
- `OnModuleDestroy`:
  - Emit lightweight shutdown event: `platform.service.shutdown.v1`.
- Heartbeat:
  - If `heartbeatIntervalMinutes > 0`, start a `setInterval`.
  - Emit `platform.service.heartbeat.v1`.
  - Payload is lightweight: `{ serviceName, instanceId, timestamp }`.
  - If `includeFullManifestInHeartbeat === true`, include full manifest in payload.
- All platform events use `actor_type = 'system'` and a generated `actor_id`.

---

### Task 7 — HTTP Endpoints

**Files to create:**
- `src/discovery/discovery.controller.ts` — NestJS controller with `@Controller('discovery')`.

**Files to modify:**
- `src/discovery/discovery.module.ts` — Register `DiscoveryController` as a provider/controller.

**Key implementation details:**
- `@Controller()` — the host microservice mounts it at its own base path. We don't hardcode a global prefix.
- `GET /manifest` → returns `ServiceManifestDto` (reads from `ManifestService`).
- `GET /schemas` → returns the full schemas map (reads from `SchemaStorageService`).
- Both endpoints return `application/json`.
- If manifest/schemas files haven't been generated yet, generate on-demand.

---

### Task 8 — Testing Support for Discovery

**Files to create:**
- `src/testing/mock-manifest.service.ts`
- `src/testing/mock-discovery.service.ts`

**Files to modify:**
- `src/testing/events-toolkit-test.module.ts` — Register mock providers for `ManifestService` and `DiscoveryService`.
- `src/testing/index.ts` — Export new mocks.
- `src/testing/mock-producer.service.ts` — Add `getPublishedEventsByType(type: string)` helper.

**Key implementation details:**
- `MockManifestService`:
  - Has a `generateManifest()` method that returns a dummy `ServiceManifestDto`.
  - Allows test injection of custom manifest data.
- `MockDiscoveryService`:
  - Tracks whether `onApplicationBootstrap` / `onModuleDestroy` were called.
  - Provides `getEmittedRegistrationEvents()`, `getEmittedHeartbeatEvents()`.
- `MockProducerService` additions:
  - `getPublishedEventsByType(eventType: string): PublishedEvent[]` — filters by `event.type`.
- `EventsToolkitTestModule.forRoot()` accepts optional `discovery?: { enabled?: boolean }` and registers mocks accordingly.
- Update existing `EventsToolkitTestModule` tests if needed.

---

### Task 9 — Documentation Updates

**Files to create:**
- `docs/event-discovery.md` — Full documentation for the Event Discovery & Service Registry subsystem.

**Files to modify:**
- `docs/event-messaging-convention.md` — Add new `platform.*` subjects.
- `README.md` — Link to new doc and update feature list.
- `.agent/project-structure.md` — Already updated in Task 1.

**Key content for `docs/event-discovery.md`:**
1. Overview of the discovery system.
2. How manifests are built (decorator scanning, `payloadSchemaRef`).
3. Explanation of `/manifest` and `/schemas` endpoints.
4. How schemas are auto-generated from DTOs (`class-validator-jsonschema`).
5. Full example of `platform.service.register.v1` payload.
6. Integration with future `ms-discovery` service.
7. Guidelines for developers and AI agents on annotating events.
8. Configuration reference (`forRoot()` discovery options).

**Platform subjects to add to convention:**
- `platform.service.register.v1`
- `platform.service.heartbeat.v1`
- `platform.service.shutdown.v1`

---

## Risk Mitigation

- **`class-validator-jsonschema` compatibility**: Verify it works with the existing `class-validator` 0.14.x peer dependency. If issues arise, pin or patch.
- **File I/O in serverless/container environments**: The default file paths use `.events-toolkit/` in `process.cwd()`. Document that the host app must ensure this directory is writable.
- **Circular dependencies**: `DiscoveryModule` depends on `ProducerModule` (for platform events) and `DiscoveryService` uses `ManifestService`. Ensure NestJS DI handles this via forward refs or module imports order.
- **Decorator metadata size**: If `payloadClass` is a constructor, it may cause serialization issues. Only store the class name in metadata, and resolve the actual class via a registry.
