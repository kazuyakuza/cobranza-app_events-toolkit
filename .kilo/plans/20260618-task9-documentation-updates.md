# Task 9: Documentation Updates — Implementation Plan

## Objective

Create new documentation for Event Discovery and update existing docs with `platform.*` subjects.

## Deliverables

1. New file: `docs/event-discovery-and-service-registry.md`
2. Updated: `docs/event-messaging-convention.md` — add `platform.*` subjects section
3. Updated: `README.md` — add Discovery to features list and link new doc

---

## Step 1: Create `docs/event-discovery-and-service-registry.md`

Create a new comprehensive documentation file with the following sections and content:

### 1.1 Title & Introduction

- Title: "Event Discovery & Service Registry"
- Brief intro explaining that the Discovery module enables automatic service registration, manifest generation, and schema publishing for microservices in the Cobranza App platform.

### 1.2 Architecture Overview

- Diagram-like text showing the flow:
  ```
  NestJS App (startup)
    → DiscoveryModule.forRoot(options)
    → ManifestService scans @EmitEvent, @OnEvent, @OnRequestReply decorators
    → Builds ServiceManifestDto
    → SchemaGenerator extracts class-validator JSON Schemas
    → DiscoveryController exposes GET /discovery/manifest and GET /discovery/schemas
    → DiscoveryEventPublisher emits platform events via NATS
  ```
- Brief description of each component: `DiscoveryService`, `ManifestService`, `SchemaGenerator`, `SchemaPersister`, `DiscoveryController`, `DiscoveryEventPublisher`.

### 1.3 Service Manifest

- Explain `ServiceManifestDto` structure:
  ```json
  {
    "name": "payment-service",
    "version": "1.0.0",
    "description": "Handles payment operations",
    "instanceId": "inst_abc123def456",
    "consumes": [ ... ],
    "produces": [ ... ]
  }
  ```
- Explain each field: `name`, `version`, `description`, `instanceId`, `consumes`, `produces`.
- Explain how `ServiceInfo` is resolved: `resolveServiceInfo()` merges `package.json` defaults with user-provided `ServiceInfoOverrides` (name, version, description, instanceId). Priority: explicit overrides > package.json > generated values.

### 1.4 Manifest Entry Fields (`ManifestEntryBase`)

- Table of `ManifestEntryBase` fields:
  | Field | Type | Description |
  |-------|------|-------------|
  | `subject` | `string` | NATS subject pattern. Producers use `{companyId}` placeholder; consumers use `*` wildcard |
  | `payloadSchemaRef` | `string` | Class name of the event data type used for schema lookup |
  | `description` | `string` | Human-readable description from decorator options |
  | `version` | `string` | Major version string (e.g., `'1'`) |
  | `handler` | `string` | Method name of the decorated handler |
  | `tags` | `string[]` | Categorization tags from decorator options |
  | `payloadExample` | `Record<string, unknown>` | Optional example payload for documentation |
- Explain `ManifestConsumeEntry` adds `type: 'event' | 'request-reply'`.
- Explain `ManifestProduceEntry` extends base with no extra fields.
- Show example entries for both produce and consume.

### 1.5 How `payloadSchemaRef` Works

- Explain the resolution strategy in `ManifestEntryBuilder.extractPayloadSchemaRef()`:
  1. **Explicit override**: If `payloadSchemaRef` is provided in decorator options, use it directly.
  2. **For producers (`@EmitEvent`)**: Prefer return type name from `Reflect.getMetadata('design:returntype', ...)`, then fall back to first parameter type.
  3. **For consumers (`@OnEvent`, `@OnRequestReply`)**: Prefer first parameter type name from `Reflect.getMetadata('design:paramtypes', ...)`, then fall back to return type.
  4. **Excluded types**: `EventEnvelope`, `EventBase`, and `Object` are treated as generic wrappers and excluded.
  5. **Empty result**: Returns empty string if no resolvable type name is found.
- Show code examples with and without explicit `payloadSchemaRef`.

### 1.6 HTTP Endpoints — DiscoveryController

The `DiscoveryController` is a NestJS HTTP controller mounted at the `discovery` route prefix:

#### `GET /discovery/manifest`

Returns the cached `ServiceManifestDto`. The manifest is generated on first access (or at startup if `registerOnStartup: true`).

- Response: Full `ServiceManifestDto` JSON object.
- Example response included.

#### `GET /discovery/schemas`

Returns all generated JSON Schemas keyed by class name (i.e., `payloadSchemaRef`).

- Response: `SchemaCollection` — an object mapping class names to JSON Schema objects.
- Example response snippet.

- Note: These endpoints are subjective to the NestJS app's HTTP adapter (Express or Fastify). The controller must be accessible via HTTP (not NATS).

### 1.7 Schema Auto-Generation from DTOs

- Explain that `SchemaGenerator` uses `class-validator-jsonschema` to convert `class-validator` decorators into JSON Schema (Draft-07).
- Process:
  1. On module init (or first access), `generateSchemasForManifest(manifest)` is called.
  2. It extracts unique `payloadSchemaRef` values from all manifest entries.
  3. It calls `validationMetadatasToSchemas()` to generate schemas from all registered `class-validator` decorated classes.
  4. It filters to only schemas matching manifest references.
  5. It enriches each schema with `$schema` header and `title`.
  6. It persists each schema to disk as `<SchemaName>.json` and writes a `schema-manifest.json` index file.
- Explain `SchemaPersister` role: writes to `schemaDir` (default: `.events-toolkit/schemas`), creates JSON files + manifest index, uses SHA-256 hashes for cache validation.
- Show example of a generated schema JSON file.
- Mention `forceRegenerateSchemas` option.

### 1.8 Platform Event Subjects

These are system-level NATS subjects used by the discovery subsystem. **They do NOT follow the `company.{company_id}.*` convention** — they use a `platform.*` namespace because they are not tenant-specific.

| Constant | Subject | Description |
|----------|---------|-------------|
| `PLATFORM_REGISTER_SUBJECT` | `platform.service.register.v1` | Emitted on service startup with full manifest |
| `PLATFORM_HEARTBEAT_SUBJECT` | `platform.service.heartbeat.v1` | Emitted periodically as liveness signal |
| `PLATFORM_SHUTDOWN_SUBJECT` | `platform.service.shutdown.v1` | Emitted on graceful shutdown |

- Note the fixed namespace: `platform.service.{action}.v{version}`.
- The `company_id` field in platform event envelopes uses the nil UUID `00000000-0000-0000-0000-000000000000`.
- The `actor_type` is always `system` and `actor_id` is `platform-discovery`.

### 1.9 Full `platform.service.register.v1` Payload Example

Show a complete JSON envelope:

```json
{
  "id": "evt_01912abc3def4567890123456789",
  "type": "platform.service.register",
  "version": "1",
  "produced_at": "2026-06-18T01:30:00.000Z",
  "producer": "payment-service",
  "company_id": "00000000-0000-0000-0000-000000000000",
  "actor_type": "system",
  "actor_id": "platform-discovery",
  "correlation_id": "01912abc3def4567890123456789abcd",
  "causation_id": null,
  "trace_id": null,
  "reply_to": null,
  "data": {
    "name": "payment-service",
    "version": "1.0.0",
    "description": "Handles payment operations",
    "instanceId": "inst_abc123def456",
    "consumes": [
      {
        "subject": "company.*.payment.proof.uploaded.v1",
        "payloadSchemaRef": "PaymentProofUploadedData",
        "description": "Processes uploaded payment proofs",
        "version": "1",
        "handler": "onProofUploaded",
        "tags": ["payment", "proof"],
        "type": "event"
      }
    ],
    "produces": [
      {
        "subject": "company.{companyId}.payment.proof.uploaded.v1",
        "payloadSchemaRef": "PaymentProofUploadedData",
        "description": "Proof was uploaded",
        "version": "1",
        "handler": "handleUpload",
        "tags": ["payment", "proof"]
      }
    ]
  }
}
```

Also show the `platform.service.heartbeat.v1` and `platform.service.shutdown.v1` payload examples (with and without full manifest in heartbeat).

### 1.10 Discovery Module Setup

Show configuration examples:

**Sync configuration:**
```typescript
import { EventsToolkitModule } from '@cobranza-apps/events-toolkit';

EventsToolkitModule.forRoot({
  nats: { servers: ['nats://localhost:4222'] },
  discovery: {
    enabled: true,
    registerOnStartup: true,
    heartbeatIntervalMinutes: 5,
    includeFullManifestInHeartbeat: false,
    service: { name: 'payment-service', version: '1.0.0' },
    schemaDir: '.events-toolkit/schemas',
    forceRegenerateSchemas: false,
  },
})
```

**Async configuration:**
```typescript
EventsToolkitModule.forRootAsync({
  useFactory: async (configService: ConfigService) => ({
    nats: { servers: configService.get('NATS_URLS') },
    discovery: {
      enabled: true,
      service: { name: configService.get('SERVICE_NAME') },
    },
  }),
  inject: [ConfigService],
})
```

**Standalone module configuration:**
```typescript
import { DiscoveryModule } from '@cobranza-apps/events-toolkit';

DiscoveryModule.forRoot({
  enabled: true,
  registerOnStartup: true,
  service: { name: 'payment-service', version: '1.0.0' },
})
```

Explain each `EventsToolkitDiscoveryOptions` field:
| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | `boolean` | `true` | Enable/disable discovery |
| `registerOnStartup` | `boolean` | `true` | Whether to publish registration on bootstrap |
| `heartbeatIntervalMinutes` | `number` | `0` | Heartbeat interval; 0 = disabled |
| `includeFullManifestInHeartbeat` | `boolean` | `false` | Include full manifest in heartbeat payload |
| `service` | `ServiceInfoOverrides` | auto from `package.json` | Service identity overrides |
| `schemaDir` | `string` | `.events-toolkit/schemas` | Directory path for schema persistence |
| `forceRegenerateSchemas` | `boolean` | `false` | Force schema regeneration on startup |

### 1.11 Annotating Decorators for Discovery

Show how each decorator supports discovery metadata:

**@EmitEvent — Producer annotation:**
```typescript
@EmitEvent('payment.proof.uploaded', {
  version: '1',
  description: 'A payment proof file was uploaded',
  tags: ['payment', 'proof'],
  payloadSchemaRef: 'PaymentProofUploadedData',
  payloadExample: { paymentAttemptId: 'uuid', fileUrl: 'https://...', amount: 100, currency: 'MXN' },
})
```

**@OnEvent — Consumer annotation:**
```typescript
@OnEvent('payment.proof.uploaded', {
  version: '1',
  description: 'Processes uploaded payment proofs',
  tags: ['payment', 'proof'],
  payloadSchemaRef: 'PaymentProofUploadedData',
})
```

**@OnRequestReply — Request-Reply consumer annotation:**
```typescript
@OnRequestReply('credit.check.completed', {
  companyId: '550e8400-e29b-41d4-a716-446655440000',
  description: 'Handles credit check completion responses',
  tags: ['credit'],
  payloadSchemaRef: 'CreditCheckResultData',
})
```

Emphasize that `payloadSchemaRef` is resolved automatically from TypeScript reflect metadata when possible, but can be overridden explicitly for precision.

### 1.12 Heartbeat & Graceful Shutdown

- Explain `heartbeatIntervalMinutes`: when > 0, `DiscoveryService` starts a `setInterval` timer emitting `platform.service.heartbeat.v1` events.
- Explain `includeFullManifestInHeartbeat`: when true, the full `ServiceManifestDto` is embedded in the heartbeat payload.
- Explain graceful shutdown: `onModuleDestroy` stops the heartbeat timer and publishes `platform.service.shutdown.v1`.
- Explain that if `ProducerService` is unavailable, event publishing is silently skipped (best-effort).

### 1.13 Integration with Future `ms-discovery` Service

Outline how an `ms-discovery` service would subscribe to platform events:

- **Subscribing to `platform.service.register.v1`**: An `ms-discovery` service would create a durable JetStream consumer on `platform.service.register.v1`, process registration events, and store service manifests in a database (e.g., PostgreSQL).
- **Subscribing to `platform.service.heartbeat.v1`**: Track liveness; mark services as unhealthy if heartbeats are not received within a configurable timeout.
- **Subscribing to `platform.service.shutdown.v1`**: Mark services as offline and clean up registrations.
- **Querying `/discovery/manifest` and `/discovery/schemas`**: An `ms-discovery` aggregator could periodically poll each service's `/discovery/manifest` endpoint to reconcile registrations, or rely solely on NATS events.
- **Building a Service Registry UI**: Aggregate manifests from all services to build a visual service map showing which services produce and consume which event types.
- Suggested JetStream stream configuration for platform events.

### 1.14 Developer & AI Agent Guidelines for Event Discovery

Checklist and rules:

1. **Always annotate event decorators with `description` and `tags`** — these become part of the service manifest and improve discoverability.
2. **Use `payloadSchemaRef` explicitly** when the auto-resolved type name doesn't match the DTO class name (e.g., when the type resolves to a generic wrapper).
3. **Ensure class-validator decorators are on all DTO fields** — `SchemaGenerator` uses `class-validator-jsonschema` to auto-generate JSON Schemas from these decorators.
4. **Provide `payloadExample` in decorator options** — this gives concrete documentation for the manifest and helps other teams understand the event format without reading source code.
5. **Do NOT use `platform.*` subjects for domain events** — platform subjects are reserved for discovery infrastructure. Domain events must follow `company.{company_id}.{domain}.{entity}.{action}.v{version}`.
6. **Set `heartbeatIntervalMinutes > 0`** in production to enable liveness tracking.
7. **Configure `schemaDir`** to a persistent volume in containerized environments so schemas survive restarts.
8. **Use `DiscoveryModule.forRootAsync()`** when service identity depends on runtime configuration (e.g., environment variables).

---

## Step 2: Update `docs/event-messaging-convention.md`

### 2.1 Add "Platform Event Subjects" Section

Insert a new section (after Section 2, before Section 3) titled "2.2 Platform Event Subjects" with the following content:

```markdown
### 2.2 Platform Event Subjects

Platform events use a special `platform.*` namespace for service discovery infrastructure. These subjects do **not** follow the tenant-isolated `company.{company_id}.*` format because they are system-level concerns, not tenant-specific business events.

| Subject | Type | Description |
|---------|------|-------------|
| `platform.service.register.v1` | Event | Service instance registered its manifest |
| `platform.service.heartbeat.v1` | Event | Periodic liveness signal from a service instance |
| `platform.service.shutdown.v1` | Event | Service instance is shutting down gracefully |

**Key differences from domain subjects:**

- No `company_id` segment — platform events are global, not tenant-scoped.
- The `company_id` field in the envelope uses the nil UUID `00000000-0000-0000-0000-000000000000`.
- The `actor_type` is always `system` and `actor_id` is `platform-discovery`.

For full details, see [Event Discovery & Service Registry](event-discovery-and-service-registry.md).
```

### 2.2 Add Table of Contents Entry

Add `- [2.2 Platform Event Subjects](#22-platform-event-subjects)` under the Table of Contents after the existing Section 2 entry.

### 2.3 Update Section 2 Rules

Add a brief note at the end of the existing "Rules" subsection:

```markdown
> **Platform subjects** follow a different pattern (`platform.service.{action}.v{version}`) and are not tenant-isolated. See [Section 2.2](#22-platform-event-subjects) for details.
```

---

## Step 3: Update `README.md`

### 3.1 Add Discovery to "What it provides" list

Insert a new bullet after the "Event Logger" item:

```markdown
- **Discovery Module**: `DiscoveryModule`, `DiscoveryService`, `@EmitEvent/@OnEvent/@OnRequestReply` manifest annotation, schema auto-generation from class-validator DTOs, service registration via `platform.service.register.v1` events, periodic heartbeats, and HTTP endpoints for manifest/schema retrieval
```

### 3.2 Add "Discovery" subsection under "Usage"

Insert a new `### Discovery` subsection after the "### Outbox Pattern" section (or after the "### Subject Builder" section, whichever is more appropriate in the current ordering). Content:

```markdown
### Discovery

Configure the discovery subsystem to auto-register your service and generate JSON Schemas:

```typescript
import { EventsToolkitModule } from '@cobranza-apps/events-toolkit';

EventsToolkitModule.forRoot({
  nats: { servers: ['nats://localhost:4222'] },
  discovery: {
    enabled: true,
    registerOnStartup: true,
    heartbeatIntervalMinutes: 5,
    service: { name: 'payment-service', version: '1.0.0' },
  },
})
```

For the full guide, see [Event Discovery & Service Registry](docs/event-discovery-and-service-registry.md).
```

### 3.3 Add link in "Related Documentation"

Add this entry to the "Related Documentation" list:

```markdown
- [Event Discovery & Service Registry](docs/event-discovery-and-service-registry.md) — Service manifest, schema generation, platform events, and discovery module setup
```

---

## Step 4: Verify Documentation Consistency

After creating/updating all files:

1. Read all three modified files to verify content accuracy.
2. Ensure cross-references between docs are correct (relative paths, section anchors).
3. Verify there are no broken links.
4. Confirm the `platform.*` subject notation is clearly distinguished from `company.*` subjects.
5. Ensure the `platform.service.register.v1` payload example is consistent with the actual `DiscoveryEventPublisher` implementation.

---

## Step 5: Commit

Commit all changes with message: `docs: event discovery documentation and platform subjects update`

Files to commit:
- `docs/event-discovery-and-service-registry.md` (new)
- `docs/event-messaging-convention.md` (modified)
- `README.md` (modified)