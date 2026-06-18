# Event Discovery & Service Registry

The Discovery module enables automatic service registration, manifest generation, and schema publishing for microservices in the Cobranza App platform.

---

## Architecture Overview

The discovery subsystem operates during NestJS application startup and periodically thereafter:

```
NestJS App (startup)
  → DiscoveryModule.forRoot(options)
  → ManifestService scans @EmitEvent, @OnEvent, @OnRequestReply decorators
  → Builds ServiceManifestDto
  → SchemaGenerator extracts class-validator JSON Schemas
  → DiscoveryController exposes GET /discovery/manifest and GET /discovery/schemas
  → DiscoveryEventPublisher emits platform events via NATS
```

### Key Components

| Component | Role |
|-----------|------|
| `DiscoveryService` | Orchestrates manifest generation, heartbeat scheduling, and shutdown |
| `ManifestService` | Scans decorated handlers and builds the `ServiceManifestDto` |
| `SchemaGenerator` | Converts `class-validator` decorators to JSON Schema (Draft-07) |
| `SchemaPersister` | Writes generated schemas to disk and maintains a schema manifest index |
| `DiscoveryController` | NestJS HTTP controller exposing `/discovery/manifest` and `/discovery/schemas` |
| `DiscoveryEventPublisher` | Publishes `platform.service.*` events via NATS JetStream |

---

## Service Manifest

The `ServiceManifestDto` is the core data structure representing a service instance's capabilities:

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

### Field Descriptions

| Field | Type | Description |
|-------|------|-------------|
| `name` | `string` | Microservice name (kebab-case) |
| `version` | `string` | Semver version of the service |
| `description` | `string` | Human-readable service description |
| `instanceId` | `string` | Unique instance identifier for this deployment |
| `consumes` | `ManifestConsumeEntry[]` | Subjects this service subscribes to (events + request-reply) |
| `produces` | `ManifestProduceEntry[]` | Subjects this service publishes |

### Service Identity Resolution

`resolveServiceInfo()` determines the service identity by merging:

1. **`package.json` defaults** — `name` and `version` are read automatically.
2. **`ServiceInfoOverrides`** — user-provided overrides for `name`, `version`, `description`, and `instanceId`.

Priority: explicit overrides > package.json > generated values.

---

## Manifest Entry Fields (`ManifestEntryBase`)

Each entry in `consumes` and `produces` is built from `ManifestEntryBase`:

| Field | Type | Description |
|-------|------|-------------|
| `subject` | `string` | NATS subject pattern. Producers use `{companyId}` placeholder; consumers use `*` wildcard |
| `payloadSchemaRef` | `string` | Class name of the event data type used for schema lookup |
| `description` | `string` | Human-readable description from decorator options |
| `version` | `string` | Major version string (e.g., `'1'`) |
| `handler` | `string` | Method name of the decorated handler |
| `tags` | `string[]` | Categorization tags from decorator options |
| `payloadExample` | `Record<string, unknown>` | Optional example payload for documentation |

### Consumer vs Producer Entries

- **`ManifestConsumeEntry`** adds `type: 'event' | 'request-reply'` to distinguish event subscriptions from request-reply handlers.
- **`ManifestProduceEntry`** extends the base with no additional fields.

Example consumer entry:

```json
{
  "subject": "company.*.payment.proof.uploaded.v1",
  "payloadSchemaRef": "PaymentProofUploadedData",
  "description": "Processes uploaded payment proofs",
  "version": "1",
  "handler": "onProofUploaded",
  "tags": ["payment", "proof"],
  "type": "event"
}
```

Example producer entry:

```json
{
  "subject": "company.{companyId}.payment.proof.uploaded.v1",
  "payloadSchemaRef": "PaymentProofUploadedData",
  "description": "Proof was uploaded",
  "version": "1",
  "handler": "handleUpload",
  "tags": ["payment", "proof"]
}
```

---

## How `payloadSchemaRef` Works

`ManifestEntryBuilder.extractPayloadSchemaRef()` resolves the payload schema reference using the following strategy:

1. **Explicit override**: If `payloadSchemaRef` is provided in decorator options, use it directly.
2. **For producers (`@EmitEvent`)**: Prefer return type name from `Reflect.getMetadata('design:returntype', ...)`, then fall back to first parameter type.
3. **For consumers (`@OnEvent`, `@OnRequestReply`)**: Prefer first parameter type name from `Reflect.getMetadata('design:paramtypes', ...)`, then fall back to return type.
4. **Excluded types**: `EventEnvelope`, `EventBase`, and `Object` are treated as generic wrappers and excluded.
5. **Empty result**: Returns empty string if no resolvable type name is found.

### With explicit `payloadSchemaRef`:

```typescript
@EmitEvent('payment.proof.uploaded', {
  version: '1',
  payloadSchemaRef: 'PaymentProofUploadedData',
})
async handleUpload(dto: UploadDto, context: EventContext): Promise<PaymentProofUploadedData> {
  // ...
}
```

### Without explicit `payloadSchemaRef` (auto-resolved):

```typescript
@EmitEvent('payment.proof.uploaded', { version: '1' })
handleUpload(dto: UploadDto, context: EventContext): PaymentProofUploadedData {
  // payloadSchemaRef resolves to "PaymentProofUploadedData" from the return type
}
```

> **Note for async methods:** TypeScript's `design:returntype` metadata resolves to `Promise` for `async` methods. Since `Promise` is not unwrapped by the auto-resolution logic, the resolved name would be `"Promise"` rather than the inner type. For async producers/consumers, always provide an explicit `payloadSchemaRef` to ensure correct schema resolution.

---

## HTTP Endpoints — DiscoveryController

The `DiscoveryController` is a NestJS HTTP controller mounted at the `discovery` route prefix.

### `GET /discovery/manifest`

Returns the cached `ServiceManifestDto`. The manifest is generated on first access (or at startup if `registerOnStartup: true`).

**Response:** Full `ServiceManifestDto` JSON object.

```json
{
  "name": "payment-service",
  "version": "1.0.0",
  "description": "Handles payment operations",
  "instanceId": "inst_abc123def456",
  "consumes": [],
  "produces": []
}
```

### `GET /discovery/schemas`

Returns all generated JSON Schemas keyed by class name (i.e., `payloadSchemaRef`).

**Response:** `SchemaCollection` — an object mapping class names to JSON Schema objects.

```json
{
  "PaymentProofUploadedData": {
    "$schema": "http://json-schema.org/draft-07/schema#",
    "title": "PaymentProofUploadedData",
    "type": "object",
    "properties": {
      "paymentAttemptId": { "type": "string", "format": "uuid" },
      "fileUrl": { "type": "string", "format": "uri" },
      "amount": { "type": "number" },
      "currency": { "type": "string", "enum": ["USD", "MXN", "COP"] }
    },
    "required": ["paymentAttemptId", "fileUrl", "amount", "currency"]
  }
}
```

> **Note:** These endpoints are subject to the NestJS app's HTTP adapter (Express or Fastify). The controller must be accessible via HTTP (not NATS).

---

## Schema Auto-Generation from DTOs

The `SchemaGenerator` uses `class-validator-jsonschema` to convert `class-validator` decorators into JSON Schema (Draft-07).

### Process

1. On module init when `registerOnStartup` is `true`, `generateSchemasForManifest(manifest)` is called.
2. It extracts unique `payloadSchemaRef` values from all manifest entries.
3. It calls `validationMetadatasToSchemas()` to generate schemas from all registered `class-validator` decorated classes.
4. It filters to only schemas matching manifest references.
5. It enriches each schema with `$schema` header and `title`.
6. It persists each schema to disk as `<SchemaName>.json` and writes a `schema-manifest.json` index file.

### SchemaPersister

The `SchemaPersister` writes generated schemas to disk:

- **Default directory**: `.events-toolkit/schemas`
- **Files**: Each schema is written as `<SchemaName>.json` (e.g., `PaymentProofUploadedData.json`)
- **Index file**: `schema-manifest.json` lists all available schemas with their file paths
- **Change tracking**: Stores a SHA-256 hash of each schema in `schema-manifest.json` for change tracking and cache validation

Example generated schema file (`.events-toolkit/schemas/PaymentProofUploadedData.json`):

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "PaymentProofUploadedData",
  "type": "object",
  "properties": {
    "paymentAttemptId": { "type": "string", "format": "uuid" },
    "fileUrl": { "type": "string", "format": "uri" },
    "amount": { "type": "number", "minimum": 0 },
    "currency": { "type": "string", "enum": ["USD", "MXN", "COP"] }
  },
  "required": ["paymentAttemptId", "fileUrl", "amount", "currency"]
}
```

### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `forceRegenerateSchemas` | `boolean` | `false` | If `true`, regenerates all schemas on every startup, ignoring cached versions |

---

## Platform Event Subjects

These are system-level NATS subjects used by the discovery subsystem. **They do NOT follow the `company.{company_id}.*` convention** — they use a `platform.*` namespace because they are not tenant-specific.

| Constant | Subject | Description |
|----------|---------|-------------|
| `PLATFORM_REGISTER_SUBJECT` | `platform.service.register.v1` | Emitted on service startup with full manifest |
| `PLATFORM_HEARTBEAT_SUBJECT` | `platform.service.heartbeat.v1` | Emitted periodically as liveness signal |
| `PLATFORM_SHUTDOWN_SUBJECT` | `platform.service.shutdown.v1` | Emitted on graceful shutdown |

**Key differences from domain subjects:**

- Fixed namespace: `platform.service.{action}.v{version}` — no `{companyId}` segment.
- The `company_id` field in platform event envelopes uses the nil UUID `00000000-0000-0000-0000-000000000000`.
- The `actor_type` is always `system` and `actor_id` is `platform-discovery`.
- These subjects are global, not tenant-scoped.

### Full `platform.service.register.v1` Payload Example

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

### `platform.service.heartbeat.v1` Payload Example

Heartbeat events are lightweight liveness signals. When `includeFullManifestInHeartbeat` is `false` (default), only identity fields are included:

```json
{
  "id": "evt_01912abc3def4567890123456790",
  "type": "platform.service.heartbeat",
  "version": "1",
  "produced_at": "2026-06-18T01:35:00.000Z",
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
    "instanceId": "inst_abc123def456",
    "timestamp": "2026-06-18T01:35:00.000Z"
  }
}
```

### `platform.service.shutdown.v1` Payload Example

```json
{
  "id": "evt_01912abc3def4567890123456791",
  "type": "platform.service.shutdown",
  "version": "1",
  "produced_at": "2026-06-18T02:00:00.000Z",
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
    "instanceId": "inst_abc123def456",
    "timestamp": "2026-06-18T02:00:00.000Z"
  }
}
```

---

## Discovery Module Setup

### Sync Configuration

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

### Async Configuration

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

### Standalone Module Configuration

```typescript
import { DiscoveryModule } from '@cobranza-apps/events-toolkit';

DiscoveryModule.forRoot({
  enabled: true,
  registerOnStartup: true,
  service: { name: 'payment-service', version: '1.0.0' },
})
```

### Options Reference

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | `boolean` | `true` | Enable/disable discovery |
| `registerOnStartup` | `boolean` | `true` | Whether to publish registration on bootstrap |
| `heartbeatIntervalMinutes` | `number` | `0` | Heartbeat interval; `0` = disabled |
| `includeFullManifestInHeartbeat` | `boolean` | `false` | Include full manifest in heartbeat payload |
| `service` | `ServiceInfoOverrides` | auto from `package.json` | Service identity overrides |
| `schemaDir` | `string` | `.events-toolkit/schemas` | Directory path for schema persistence |
| `forceRegenerateSchemas` | `boolean` | `false` | Force schema regeneration on startup |

---

## Annotating Decorators for Discovery

Each decorator supports metadata that feeds into the service manifest.

### `@EmitEvent` — Producer Annotation

```typescript
@EmitEvent('payment.proof.uploaded', {
  version: '1',
  description: 'A payment proof file was uploaded',
  tags: ['payment', 'proof'],
  payloadSchemaRef: 'PaymentProofUploadedData',
  payloadExample: {
    paymentAttemptId: 'uuid',
    fileUrl: 'https://...',
    amount: 100,
    currency: 'MXN',
  },
})
async handleUpload(dto: UploadDto, context: EventContext): Promise<PaymentProofUploadedData> {
  // ...
}
```

### `@OnEvent` — Consumer Annotation

```typescript
@OnEvent('payment.proof.uploaded', {
  version: '1',
  description: 'Processes uploaded payment proofs',
  tags: ['payment', 'proof'],
  payloadSchemaRef: 'PaymentProofUploadedData',
})
async onProofUploaded(event: EventEnvelope<PaymentProofUploadedData>): Promise<void> {
  // ...
}
```

### `@OnRequestReply` — Request-Reply Consumer Annotation

```typescript
@OnRequestReply('credit.check.completed', {
  companyId: '550e8400-e29b-41d4-a716-446655440000',
  description: 'Handles credit check completion responses',
  tags: ['credit'],
  payloadSchemaRef: 'CreditCheckResultData',
})
async handleCreditCheckResponse(event: EventEnvelope<CreditCheckResultData>): Promise<void> {
  // ...
}
```

> **Note:** `payloadSchemaRef` is resolved automatically from TypeScript reflect metadata when possible, but can be overridden explicitly for precision.

---

## Heartbeat & Graceful Shutdown

### Heartbeat

When `heartbeatIntervalMinutes > 0`, `DiscoveryService` starts a `setInterval` timer that periodically emits `platform.service.heartbeat.v1` events.

When `includeFullManifestInHeartbeat` is `true`, the full `ServiceManifestDto` is embedded in the heartbeat payload. When `false`, only identity fields (`name`, `version`, `instanceId`) are included.

### Graceful Shutdown

On `onModuleDestroy` (triggered by NestJS lifecycle):

1. The heartbeat timer is stopped.
2. A `platform.service.shutdown.v1` event is published.
3. If `ProducerService` is unavailable, event publishing is silently skipped (best-effort).

---

## Integration with Future `ms-discovery` Service

An `ms-discovery` aggregator service would consume platform events to maintain a centralized registry:

### Subscribing to `platform.service.register.v1`

An `ms-discovery` service would create a durable JetStream consumer on `platform.service.register.v1`, process registration events, and store service manifests in a database (e.g., PostgreSQL).

### Subscribing to `platform.service.heartbeat.v1`

Track liveness — mark services as unhealthy if heartbeats are not received within a configurable timeout.

### Subscribing to `platform.service.shutdown.v1`

Mark services as offline and clean up registrations.

### Querying `/discovery/manifest` and `/discovery/schemas`

An aggregator could periodically poll each service's HTTP endpoints to reconcile registrations, or rely solely on NATS events.

### Building a Service Registry UI

Aggregate manifests from all services to build a visual service map showing which services produce and consume which event types.

### Suggested JetStream Configuration

```typescript
await nc.jetStreamManager.streams.add({
  name: 'PLATFORM_EVENTS',
  subjects: ['platform.service.>'],
  retention: 'limits',
  max_age: 7 * 24 * 60 * 60 * 1_000_000_000, // 7 days
  max_msgs_per_subject: 10_000,
  storage: 'file',
  dedupe_window: 2 * 60 * 1_000_000_000, // 2 minutes
});
```

---

## Developer & AI Agent Guidelines for Event Discovery

1. **Always annotate event decorators with `description` and `tags`** — these become part of the service manifest and improve discoverability.

2. **Use `payloadSchemaRef` explicitly** when the auto-resolved type name doesn't match the DTO class name (e.g., when the type resolves to a generic wrapper).

3. **Ensure class-validator decorators are on all DTO fields** — `SchemaGenerator` uses `class-validator-jsonschema` to auto-generate JSON Schemas from these decorators.

4. **Provide `payloadExample` in decorator options** — this gives concrete documentation for the manifest and helps other teams understand the event format without reading source code.

5. **Do NOT use `platform.*` subjects for domain events** — platform subjects are reserved for discovery infrastructure. Domain events must follow `company.{company_id}.{domain}.{entity}.{action}.v{version}`.

6. **Set `heartbeatIntervalMinutes > 0`** in production to enable liveness tracking.

7. **Configure `schemaDir`** to a persistent volume in containerized environments so schemas survive restarts.

8. **Use `DiscoveryModule.forRootAsync()`** when service identity depends on runtime configuration (e.g., environment variables).
