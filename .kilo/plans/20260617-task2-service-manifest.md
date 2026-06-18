# Task 2: Service Manifest & Schema References — Implementation Plan

## Objective

Create `ServiceManifestDto` and nested DTOs in `src/discovery/dto/`, implement `ManifestService` that scans `@OnEvent`, `@EmitEvent`, and `@OnRequestReply` decorators via NestJS reflection, and generate a full service manifest with consume/produce entries including subject, payloadSchemaRef, handler, tags, and description.

---

## Pre-Analysis

### Current Codebase State

- **Three decorators** exist:
  - `@OnEvent(options: OnEventOptions)` — stores `{ domain, entity, action, version? }` under `ON_EVENT_METADATA`
  - `@EmitEvent(options: EmitEventOptions)` — stores `{ domain, entity, action, version? }` under `EMIT_EVENT_METADATA`
  - `@OnRequestReply(options: OnRequestReplyOptions)` — stores `{ eventType, companyId? }` under `ON_REQUEST_REPLY_METADATA`
- **Two explorers** exist (`OnEventExplorer`, `OnRequestReplyExplorer`) that use `DiscoveryService` + `Reflector` to scan providers/controllers and register handlers at startup.
- **EmitEventInterceptor** reads `@EmitEvent` metadata at runtime; no explorer-style preprocessing exists for producers.
- **SubjectBuilder** builds NATS subjects from `BuildSubjectDto` in the format `company.{companyId}.{domain}.{entity}.{action}.v{version}`.
- **DiscoveryModule/Service** exist but minimal — only logs a startup event when `registerOnStartup` is true.
- **TypeScript `design:paramtypes`** metadata only captures the constructor function of method parameter types. Generic type parameters (e.g., `EventEnvelope<PaymentProofUploadedEvent>`) are erased at runtime — only `EventEnvelope` is available via reflection.

### Design Decisions

1. **payloadSchemaRef extraction strategy**: Three-tier fallback:
   - **Explicit**: Read `payloadSchemaRef` from decorator options (new optional field).
   - **Reflected**: Use `design:paramtypes` metadata to extract the first parameter's class name.
   - **Unknown**: If reflected type is `EventEnvelope` or `EventBase` (generic erased), or reflection is unavailable, set `payloadSchemaRef` to empty string.
2. **Decorator options extension**: Add `description?: string`, `tags?: string[]`, `payloadSchemaRef?: string` to all three decorator options interfaces. Fully backward compatible — all new fields are optional.
3. **ManifestService is injectable**: Uses `DiscoveryService`, `Reflector`, and `MetadataScanner` from `@nestjs/core`.
4. **Service metadata via configuration**: Add `ServiceInfo` to `EventsToolkitDiscoveryOptions` so users provide name, version, description at module registration.
5. **instanceId auto-generation**: If `instanceId` is not provided, generate a UUID at construction time using the existing `generateEventId` utility (adapted for instance ID).
6. **ConsumeEntryDto type discriminator**: Distinguishes `'event'` (from `@OnEvent`) from `'request-reply'` (from `@OnRequestReply`) so consumers of the manifest can route entries appropriately.
7. **Subject format in manifest**:
   - `@OnEvent` entries: `company.*.{domain}.{entity}.{action}.v{version}` (wildcard consumer pattern)
   - `@EmitEvent` entries: `company.{companyId-marker}.{domain}.{entity}.{action}.v{version}` — use a placeholder `{companyId}` since the actual companyId is runtime-dependent
   - `@OnRequestReply` entries: use the `eventType` field directly (e.g., `payment.proof.uploaded`)

---

## Implementation Steps

### Step 1: Create `src/discovery/dto/manifest-entry-base.dto.ts`

Create a base interface for shared manifest entry fields.

```typescript
/** Base fields shared by all manifest entries (consume and produce). */
export interface ManifestEntryBase {
  /** NATS subject pattern (wildcard for consumers, template for producers). */
  subject: string;
  /** Reference to the payload schema (e.g., class name of the event data type). */
  payloadSchemaRef: string;
  /** Human-readable description of what this entry represents. */
  description: string;
  /** Version string for this entry's subject format (e.g., '1'). */
  version: string;
  /** Name of the handler or producer method. */
  handler: string;
  /** Arbitrary tags for categorization and filtering. */
  tags: string[];
}
```

### Step 2: Create `src/discovery/dto/manifest-consume-entry.dto.ts`

```typescript
import { ManifestEntryBase } from './manifest-entry-base.dto';

/** Discriminator type for event consumer entries. */
export type ConsumeEntryType = 'event' | 'request-reply';

/** A single consumed event or request-reply entry in the service manifest. */
export interface ManifestConsumeEntry extends ManifestEntryBase {
  /** Whether this entry comes from @OnEvent ('event') or @OnRequestReply ('request-reply'). */
  type: ConsumeEntryType;
}
```

### Step 3: Create `src/discovery/dto/manifest-produce-entry.dto.ts`

```typescript
import { ManifestEntryBase } from './manifest-entry-base.dto';

/** A single produced event entry in the service manifest. */
export interface ManifestProduceEntry extends ManifestEntryBase {}
```

### Step 4: Create `src/discovery/dto/service-manifest.dto.ts`

```typescript
import { ManifestConsumeEntry } from './manifest-consume-entry.dto';
import { ManifestProduceEntry } from './manifest-produce-entry.dto';

/** Complete service manifest describing a microservice's event contract. */
export interface ServiceManifestDto {
  /** Service name (e.g., 'payment-service'). */
  name: string;
  /** Service version (e.g., '1.0.0'). */
  version: string;
  /** Human-readable description of the service. */
  description: string;
  /** Unique instance identifier for this service process. */
  instanceId: string;
  /** Events and request-reply responses this service consumes. */
  consumes: ManifestConsumeEntry[];
  /** Events this service produces/emits. */
  produces: ManifestProduceEntry[];
}
```

### Step 5: Create `src/discovery/dto/index.ts`

```typescript
export { ServiceManifestDto } from './service-manifest.dto';
export { ManifestConsumeEntry, ConsumeEntryType } from './manifest-consume-entry.dto';
export { ManifestProduceEntry } from './manifest-produce-entry.dto';
export { ManifestEntryBase } from './manifest-entry-base.dto';
```

### Step 6: Update `OnEventOptions` — `src/consumer/decorators/on-event.decorator.ts`

Add three optional fields to the existing `OnEventOptions` interface:

```typescript
export interface OnEventOptions {
  domain: string;
  entity: string;
  action: string;
  version?: string;
  /** Human-readable description for discovery manifests. */
  description?: string;
  /** Arbitrary tags for categorization in discovery manifests. */
  tags?: string[];
  /** Explicit payload schema reference (e.g., 'PaymentProofUploadedEvent'). */
  payloadSchemaRef?: string;
}
```

No changes needed to the `OnEvent` decorator function itself — `SetMetadata` stores whatever is in the options object.

### Step 7: Update `EmitEventOptions` — `src/producer/decorators/emit-event.decorator.ts`

Add the same three optional fields:

```typescript
export interface EmitEventOptions {
  domain: string;
  entity: string;
  action: string;
  version?: string;
  /** Human-readable description for discovery manifests. */
  description?: string;
  /** Arbitrary tags for categorization in discovery manifests. */
  tags?: string[];
  /** Explicit payload schema reference (e.g., 'PaymentProofUploadedEvent'). */
  payloadSchemaRef?: string;
}
```

### Step 8: Update `OnRequestReplyOptions` — `src/consumer/decorators/on-request-reply.decorator.ts`

Add the same three optional fields:

```typescript
export interface OnRequestReplyOptions {
  eventType: string;
  companyId?: string;
  /** Human-readable description for discovery manifests. */
  description?: string;
  /** Arbitrary tags for categorization in discovery manifests. */
  tags?: string[];
  /** Explicit payload schema reference (e.g., 'PaymentProofUploadedData'). */
  payloadSchemaRef?: string;
}
```

### Step 9: Create `src/discovery/manifest-deps.interface.ts`

Define the dependencies interface for `ManifestService`, following the same pattern as `OnEventExplorerDeps`:

```typescript
import { DiscoveryService, Reflector, MetadataScanner } from '@nestjs/core';

/** Injection token for ManifestServiceDeps. */
export const MANIFEST_SERVICE_DEPS_TOKEN = 'MANIFEST_SERVICE_DEPS';

/** Dependencies required by ManifestService. */
export interface ManifestServiceDeps {
  /** NestJS discovery service for scanning providers and controllers. */
  discovery: DiscoveryService;
  /** NestJS reflector for reading method metadata. */
  reflector: Reflector;
  /** NestJS metadata scanner for enumerating method names. */
  metadataScanner: MetadataScanner;
}
```

### Step 10: Create `src/discovery/manifest.service.ts`

This is the core service. It scans all providers/controllers for `@OnEvent`, `@EmitEvent`, and `@OnRequestReply` metadata and builds a `ServiceManifestDto`.

**Structure** (follow max-depth and max-lines rules):

```typescript
import { Inject, Injectable } from '@nestjs/common';
import { ServiceManifestDto } from './dto/service-manifest.dto';
import { ManifestConsumeEntry } from './dto/manifest-consume-entry.dto';
import { ManifestProduceEntry } from './dto/manifest-produce-entry.dto';
import { MANIFEST_SERVICE_DEPS_TOKEN, ManifestServiceDeps } from './manifest-deps.interface';
import { ON_EVENT_METADATA, OnEventOptions } from '../consumer/decorators/on-event.decorator';
import { EMIT_EVENT_METADATA, EmitEventOptions } from '../producer/decorators/emit-event.decorator';
import { ON_REQUEST_REPLY_METADATA, OnRequestReplyOptions } from '../consumer/decorators/on-request-reply.decorator';

/** Placeholder for companyId in produced subject templates. */
const COMPANY_ID_PLACEHOLDER = '{companyId}';

@Injectable()
export class ManifestService {
  constructor(@Inject(MANIFEST_SERVICE_DEPS_TOKEN) private readonly deps: ManifestServiceDeps) {}

  /** Generates the full service manifest by scanning all decorators. */
  generateManifest(serviceInfo: ServiceInfo): ServiceManifestDto {
    const consumes = this.buildConsumeEntries();
    const produces = this.buildProduceEntries();
    return {
      name: serviceInfo.name,
      version: serviceInfo.version,
      description: serviceInfo.description ?? '',
      instanceId: serviceInfo.instanceId ?? generateInstanceId(),
      consumes,
      produces,
    };
  }

  private buildConsumeEntries(): ManifestConsumeEntry[] {
    const eventEntries = this.scanOnEventDecorators();
    const replyEntries = this.scanOnRequestReplyDecorators();
    return [...eventEntries, ...replyEntries];
  }

  private buildProduceEntries(): ManifestProduceEntry[] {
    return this.scanEmitEventDecorators();
  }

  // ... private methods for scanning each decorator type
  // ... private method for extracting payloadSchemaRef via design:paramtypes
  // ... private helper for building wildcard subject from OnEventOptions
  // ... private helper for building template subject from EmitEventOptions
}
```

Key private methods in `ManifestService`:

#### `scanOnEventDecorators(): ManifestConsumeEntry[]`
1. Call `getValidInstances()` to get all provider/controller instances
2. For each instance, use `MetadataScanner.scanFromPrototype()` to iterate method names
3. For each method, use `Reflector.get()` to read `ON_EVENT_METADATA`
4. If metadata found, build entry:
   - `subject`: `company.*.{domain}.{entity}.{action}.v{version}` (wildcard pattern)
   - `payloadSchemaRef`: from options or `design:paramtypes`
   - `description`: from `options.description ?? ''`
   - `version`: from `options.version ?? '1'`
   - `handler`: method name
   - `tags`: from `options.tags ?? []`
   - `type`: `'event'`

#### `scanOnRequestReplyDecorators(): ManifestConsumeEntry[]`
1. Same discovery scan pattern
2. Read `ON_REQUEST_REPLY_METADATA`
3. Build entry:
   - `subject`: `options.eventType` (dot-notation, not a NATS subject)
   - `payloadSchemaRef`: from options or `design:paramtypes`
   - `type`: `'request-reply'`

#### `scanEmitEventDecorators(): ManifestProduceEntry[]`
1. Same discovery scan pattern
2. Read `EMIT_EVENT_METADATA`
3. Build entry:
   - `subject`: `company.{companyId}.{domain}.{entity}.{action}.v{version}` using `{companyId}` placeholder
   - `payloadSchemaRef`: from options or `design:returntype` metadata on the method
   - Since `@EmitEvent` is on methods that return event objects, `design:returntype` may provide the class name

#### `extractPayloadSchemaRef(instance: object, methodName: string, explicitRef?: string): string`
1. If `explicitRef` is provided (from decorator options), return it directly
2. Try `Reflect.getMetadata('design:paramtypes', instance, methodName)` for consumer handlers
3. Try `Reflect.getMetadata('design:returntype', instance, methodName)` for producer methods
4. Extract class name from constructor function
5. If class name is `EventEnvelope`, `EventBase`, or `Object`, return empty string (generic erasure)

#### `getValidInstances(): object[]`
Same pattern as existing explorers — filter wrappers with valid object instances from providers and controllers.

### Step 11: Create `src/discovery/service-info.interface.ts`

```typescript
/** Service identity metadata for inclusion in the service manifest. */
export interface ServiceInfo {
  /** Service name (e.g., 'payment-service'). */
  name: string;
  /** Service version (e.g., '1.0.0'). */
  version: string;
  /** Human-readable description of the service. */
  description?: string;
  /** Unique instance identifier. Auto-generated if not provided. */
  instanceId?: string;
}
```

### Step 12: Create `src/discovery/instance-id.utils.ts`

Small utility for generating instance IDs:

```typescript
import { randomUUID } from 'crypto';

/** Generates a unique instance identifier for the service manifest. */
export function generateInstanceId(): string {
  return `inst_${randomUUID().replace(/-/g, '')}`;
}
```

### Step 13: Update `src/discovery/discovery-service-options.interface.ts`

Add `ServiceInfo` to the discovery options:

```typescript
import { ServiceInfo } from './service-info.interface';

export interface EventsToolkitDiscoveryOptions {
  enabled?: boolean;
  registerOnStartup?: boolean;
  heartbeatIntervalMinutes?: number;
  includeFullManifestInHeartbeat?: boolean;
  /** Service identity metadata for the discovery manifest. */
  service?: ServiceInfo;
}
```

### Step 14: Update `src/discovery/discovery.module.ts`

Register `ManifestService` as a provider and update the module to supply its dependencies:

- Add `ManifestService` to providers array
- Create factory provider for `MANIFEST_SERVICE_DEPS_TOKEN` that injects `DiscoveryService`, `Reflector`, and `MetadataScanner`
- Export `ManifestService` from the module
- Re-export `ManifestService` from `DiscoveryModule`

### Step 15: Update `src/discovery/discovery.service.ts`

Integrate `ManifestService`:
- Inject `ManifestService` via constructor
- In `onModuleInit`, when `registerOnStartup` is true, call `manifestService.generateManifest()` and log the manifest

### Step 16: Update `src/discovery/index.ts`

Add exports for new types:

```typescript
export { DiscoveryModule, DiscoveryModuleOptions } from './discovery.module';
export { DiscoveryService } from './discovery.service';
export { DISCOVERY_MODULE_OPTIONS, EventsToolkitDiscoveryOptions } from './discovery-service-options.interface';
export { ManifestService } from './manifest.service';
export { ServiceManifestDto, ManifestConsumeEntry, ManifestProduceEntry, ManifestEntryBase } from './dto';
export { ServiceInfo } from './service-info.interface';
export { MANIFEST_SERVICE_DEPS_TOKEN, ManifestServiceDeps } from './manifest-deps.interface';
```

### Step 17: Update existing explorer specs to account for new optional fields

The existing decorator spec files (`on-event.decorator.spec.ts`, `emit-event.decorator.spec.ts`, `on-request-reply.decorator.spec.ts`) should still pass without modifications since all new fields are optional. Verify by running tests.

### Step 18: Create unit tests for `ManifestService`

Create `src/discovery/manifest.service.spec.ts` with tests for:
- `generateManifest` returns correct structure with service info
- `scanOnEventDecorators` finds `@OnEvent` decorated methods
- `scanOnRequestReplyDecorators` finds `@OnRequestReply` decorated methods
- `scanEmitEventDecorators` finds `@EmitEvent` decorated methods
- `extractPayloadSchemaRef` prefers explicit ref over reflection
- `extractPayloadSchemaRef` falls back to `design:paramtypes`
- `extractPayloadSchemaRef` returns empty string for generic types
- Subject building for each entry type

---

## File Inventory

### New Files
| File | Purpose |
|------|---------|
| `src/discovery/dto/manifest-entry-base.dto.ts` | Base interface for shared manifest entry fields |
| `src/discovery/dto/manifest-consume-entry.dto.ts` | ConsumeEntryDto with type discriminator |
| `src/discovery/dto/manifest-produce-entry.dto.ts` | ProduceEntryDto |
| `src/discovery/dto/service-manifest.dto.ts` | ServiceManifestDto top-level interface |
| `src/discovery/dto/index.ts` | Barrel export |
| `src/discovery/service-info.interface.ts` | ServiceInfo interface |
| `src/discovery/manifest-deps.interface.ts` | ManifestServiceDeps injection token and interface |
| `src/discovery/manifest.service.ts` | ManifestService class |
| `src/discovery/instance-id.utils.ts` | Instance ID generation utility |
| `src/discovery/manifest.service.spec.ts` | Unit tests |

### Modified Files
| File | Change |
|------|--------|
| `src/consumer/decorators/on-event.decorator.ts` | Add `description?`, `tags?`, `payloadSchemaRef?` to `OnEventOptions` |
| `src/producer/decorators/emit-event.decorator.ts` | Add `description?`, `tags?`, `payloadSchemaRef?` to `EmitEventOptions` |
| `src/consumer/decorators/on-request-reply.decorator.ts` | Add `description?`, `tags?`, `payloadSchemaRef?` to `OnRequestReplyOptions` |
| `src/discovery/discovery-service-options.interface.ts` | Add `service?: ServiceInfo` to `EventsToolkitDiscoveryOptions` |
| `src/discovery/discovery.module.ts` | Register `ManifestService` and `MANIFEST_SERVICE_DEPS_TOKEN` provider |
| `src/discovery/discovery.service.ts` | Inject `ManifestService`, call on startup |
| `src/discovery/index.ts` | Export new types |

---

## Constraints Verification

- **Max 200 lines per src file**: All new files are small interfaces (<30 lines each), utility (~10 lines), and the ManifestService will be decomposed with small private methods to stay under 200 lines.
- **Max 50 lines per method**: Methods decomposed following existing explorer patterns (see `OnEventExplorer` as reference — each method is short, single-responsibility).
- **Max 2 indentation levels**: Follow existing explorer pattern — private methods call other private methods, not deep nesting.
- **Max 2 params per method**: `generateManifest(serviceInfo: ServiceInfo)` — single param object. Private scanner methods take no params (use instance state). `extractPayloadSchemaRef` takes instance and methodName (2 params) — or combine into a single options object if needed.

---

## Dependency Graph

```
ServiceManifestDto
  ├── ManifestConsumeEntry (extends ManifestEntryBase)
  │     └── ConsumeEntryType
  └── ManifestProduceEntry (extends ManifestEntryBase)
        └── (uses same ManifestEntryBase)

ManifestService
  ├── ManifestServiceDeps (injected)
  │     ├── DiscoveryService (@nestjs/core)
  │     ├── Reflector (@nestjs/core)
  │     └── MetadataScanner (@nestjs/core)
  ├── ON_EVENT_METADATA + OnEventOptions
  ├── EMIT_EVENT_METADATA + EmitEventOptions
  ├── ON_REQUEST_REPLY_METADATA + OnRequestReplyOptions
  ├── ServiceManifestDto + nested DTOs
  └── ServiceInfo

DiscoveryModule
  ├── ManifestService (new provider)
  ├── MANIFEST_SERVICE_DEPS_TOKEN (factory provider)
  └── DiscoveryService (updated)

DiscoveryService
  └── ManifestService (injected)