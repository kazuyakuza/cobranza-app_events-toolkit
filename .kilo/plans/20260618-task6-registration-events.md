# Task 6 — Automatic Registration Events: Implementation Plan

## Objective

Implement automatic registration, heartbeat, and shutdown events for the discovery subsystem. When `DiscoveryModule` is enabled, the service should:

1. Emit `platform.service.register.v1` on application bootstrap (if `registerOnStartup` is true).
2. Emit `platform.service.heartbeat.v1` on a configurable interval (if `heartbeatIntervalMinutes > 0`).
3. Emit `platform.service.shutdown.v1` on module destroy.

## Pre-Analysis

### Current State

- `DiscoveryService` implements `OnModuleInit` only — generates and logs the manifest when `enabled && registerOnStartup`.
- `ProducerService` (in `src/producer/producer.service.ts`) provides `publish(subject, envelope)` and `emit<T>(options)` for NATS JetStream publishing.
- `ProducerModule` is registered as `global: true` in `EventsToolkitModule`, making `ProducerService` available to any provider.
- `EventsToolkitDiscoveryOptions` already defines `registerOnStartup`, `heartbeatIntervalMinutes`, `includeFullManifestInHeartbeat`.
- `ServiceManifestDto` contains `{ name, version, description, instanceId, consumes, produces }`.
- `EventEnvelope` requires `company_id` (UUID with dashes), `actor_type`, `actor_id` — platform events lack a natural company context.
- `DiscoveryModule` resolves options via `resolveDiscoveryOptions()` which fills defaults in `DiscoveryModuleOptions`.

### Design Decisions

1. **Subject format**: `platform.service.{register|heartbeat|shutdown}.v1` — platform-level events bypass the `company.{companyId}` prefix since they are not tenant-scoped.
2. **Actor context**: `actor_type = SYSTEM`, `actor_id = <instanceId>`, `company_id = '00000000-0000-0000-0000-000000000000'` (nil UUID sentinel for platform events).
3. **ProducerService injection**: Use `@Optional() @Inject(ProducerService)` since `DiscoveryModule` could theoretically operate without `ProducerModule` (logging-only mode). When `ProducerService` is unavailable, lifecycle hooks log a warning and skip NATS publishing.
4. **OnApplicationBootstrap vs onModuleInit**: NATS publishing happens in `OnApplicationBootstrap` — called after all providers are initialized, ensuring the NATS connection is ready.
5. **Separation of concerns**: Extract event publishing into a dedicated `DiscoveryEventPublisher` service to keep `DiscoveryService` under 200 lines and maintain single responsibility.
6. **Heartbeat interval**: Managed via `setInterval`/`clearInterval`. Timer reference stored on `DiscoveryService`. Uses `NodeJS.Timeout` type.
7. **Shutdown publish**: Best-effort — logs errors instead of throwing since the app is shutting down.

---

## Implementation Steps

### Step 1: Create `src/discovery/events/platform-event-subjects.ts`

Subject string constants for the three platform discovery events.

```typescript
/** NATS subjects for platform-level service discovery events. */

/** Emitted when a service instance starts up and registers its manifest. */
export const PLATFORM_REGISTER_SUBJECT = 'platform.service.register.v1';

/** Emitted periodically to indicate a service instance is still alive. */
export const PLATFORM_HEARTBEAT_SUBJECT = 'platform.service.heartbeat.v1';

/** Emitted when a service instance is shutting down gracefully. */
export const PLATFORM_SHUTDOWN_SUBJECT = 'platform.service.shutdown.v1';
```

~15 lines. Well under 200.

---

### Step 2: Create `src/discovery/events/discovery-payloads.interface.ts`

Payload interfaces for heartbeat and shutdown events. The register event reuses `ServiceManifestDto` directly.

```typescript
import { ServiceManifestDto } from '../dto/service-manifest.dto';

/** Platform event payload constants. */
export const PLATFORM_COMPANY_ID = '00000000-0000-0000-0000-000000000000';
export const PLATFORM_ACTOR_ID = 'platform-discovery';

/** Payload for `platform.service.heartbeat.v1` events. */
export interface ServiceHeartbeatPayload {
  /** Service name. */
  name: string;
  /** Service version. */
  version: string;
  /** Unique instance identifier. */
  instanceId: string;
  /** ISO 8601 timestamp of this heartbeat. */
  timestamp: string;
  /** Full manifest, included when `includeFullManifestInHeartbeat` is true. */
  manifest?: ServiceManifestDto;
}

/** Payload for `platform.service.shutdown.v1` events. */
export interface ServiceShutdownPayload {
  /** Service name. */
  name: string;
  /** Service version. */
  version: string;
  /** Unique instance identifier. */
  instanceId: string;
  /** ISO 8601 timestamp of shutdown. */
  timestamp: string;
  /** Optional shutdown reason. */
  reason?: string;
}
```

~32 lines. Well under 200.

---

### Step 3: Create `src/discovery/events/discovery-event-publisher.service.ts`

Thin service responsible for building and publishing discovery lifecycle events via `ProducerService`.

```typescript
import { Injectable, Optional } from '@nestjs/common';
import { ProducerService } from '../../producer/producer.service';
import { ServiceManifestDto } from '../dto/service-manifest.dto';
import { DiscoveryModuleOptions } from '../discovery.module';
import { DISCOVERY_MODULE_OPTIONS } from '../discovery-service-options.interface';
import { generateEventId } from '../../common/utils/uuid.utils';
import { nowIso } from '../../common/utils/date.utils';
import { PlatformEventType } from './platform-event-types';
import { PLATFORM_REGISTER_SUBJECT, PLATFORM_HEARTBEAT_SUBJECT, PLATFORM_SHUTDOWN_SUBJECT } from './platform-event-subjects';
import { ServiceHeartbeatPayload, ServiceShutdownPayload, PLATFORM_COMPANY_ID, PLATFORM_ACTOR_ID } from './discovery-payloads.interface';

@Injectable()
export class DiscoveryEventPublisher {
  constructor(
    @Optional() private readonly producerService: ProducerService | null,
    @Inject(DISCOVERY_MODULE_OPTIONS) private readonly options: DiscoveryModuleOptions,
  ) {}

  async publishRegistration(manifest: ServiceManifestDto): Promise<void> {
    const subject = PLATFORM_REGISTER_SUBJECT;
    const envelope = this.buildEnvelope(subject, manifest, PlatformEventType.REGISTER);
    await this.publishOrLog(subject, envelope);
  }

  async publishHeartbeat(manifest: ServiceManifestDto): Promise<void> {
    const payload = this.buildHeartbeatPayload(manifest);
    const subject = PLATFORM_HEARTBEAT_SUBJECT;
    const envelope = this.buildEnvelope(subject, payload, PlatformEventType.HEARTBEAT);
    await this.publishOrLog(subject, envelope);
  }

  async publishShutdown(manifest: ServiceManifestDto): Promise<void> {
    const payload = this.buildShutdownPayload(manifest);
    const subject = PLATFORM_SHUTDOWN_SUBJECT;
    const envelope = this.buildEnvelope(subject, payload, PlatformEventType.SHUTDOWN);
    await this.publishOrLog(subject, envelope);
  }

  private buildHeartbeatPayload(manifest: ServiceManifestDto): ServiceHeartbeatPayload {
    const payload: ServiceHeartbeatPayload = {
      name: manifest.name,
      version: manifest.version,
      instanceId: manifest.instanceId,
      timestamp: nowIso(),
    };
    if (this.options.includeFullManifestInHeartbeat) {
      payload.manifest = manifest;
    }
    return payload;
  }

  private buildShutdownPayload(manifest: ServiceManifestDto): ServiceShutdownPayload {
    return {
      name: manifest.name,
      version: manifest.version,
      instanceId: manifest.instanceId,
      timestamp: nowIso(),
    };
  }

  private buildEnvelope(subject: string, data: unknown, eventType: string): EventEnvelope<unknown> {
    return new EventEnvelope<unknown>({
      id: generateEventId(),
      type: eventType,
      version: '1',
      produced_at: nowIso(),
      producer: manifest.name,
      company_id: PLATFORM_COMPANY_ID,
      actor_type: ActorType.SYSTEM,
      actor_id: PLATFORM_ACTOR_ID,
      correlation_id: generateUuidV7(),
      data,
    });
  }

  private async publishOrLog(subject: string, envelope: EventEnvelope<unknown>): Promise<void> {
    if (!this.producerService) {
      return;
    }
    try {
      await this.producerService.publish(subject, envelope);
    } catch (error: unknown) {
      // Best-effort: log but don't throw during lifecycle hooks
      // Logger could be injected but to keep it simple, we silently skip
    }
  }
}
```

**Note**: The `buildEnvelope` method needs `manifest.name` and `ActorType.SYSTEM` imported. Approximate line count: ~100 lines.

**Constraint adjustments**: 
- `buildEnvelope` takes `manifest` as 2nd param -> but max-2-params rule allows this.
- The `discover-event-publisher.service.ts` needs to accept `DiscoveryModuleOptions` to access `includeFullManifestInHeartbeat`.
- Consider extracting the envelope construction into its own small helper if `buildEnvelope` exceeds 50 lines — it won't.

---

### Step 4: Create `src/discovery/events/platform-event-types.ts`

Small constants file for event type strings used in envelope `type` field.

```typescript
/** Event type strings for platform discovery events. */
export const PlatformEventType = {
  REGISTER: 'platform.service.register',
  HEARTBEAT: 'platform.service.heartbeat',
  SHUTDOWN: 'platform.service.shutdown',
} as const;
```

~7 lines.

---

### Step 5: Create `src/discovery/events/index.ts`

Barrel export file.

```typescript
export { DiscoveryEventPublisher } from './discovery-event-publisher.service';
export { PLATFORM_REGISTER_SUBJECT, PLATFORM_HEARTBEAT_SUBJECT, PLATFORM_SHUTDOWN_SUBJECT } from './platform-event-subjects';
export { PlatformEventType } from './platform-event-types';
export { ServiceHeartbeatPayload, ServiceShutdownPayload, PLATFORM_COMPANY_ID, PLATFORM_ACTOR_ID } from './discovery-payloads.interface';
```

~5 lines.

---

### Step 6: Modify `src/discovery/discovery.service.ts`

Add `OnApplicationBootstrap`, `OnModuleDestroy` lifecycle hooks, inject `DiscoveryEventPublisher`, and manage heartbeat interval.

**Current file**: 42 lines.

**New structure**:

```typescript
import { Injectable, Inject, OnModuleInit, OnApplicationBootstrap, OnModuleDestroy, Optional } from '@nestjs/common';
import { DISCOVERY_MODULE_OPTIONS } from './discovery-service-options.interface';
import { DiscoveryModuleOptions } from './discovery.module';
import { ManifestService } from './manifest.service';
import { SchemaGenerator } from './utils/schema-generator';
import { ServiceManifestDto } from './dto/service-manifest.dto';
import { EventLoggerService } from '../logging/event-logger.service';
import { DiscoveryEventPublisher } from './events/discovery-event-publisher.service';

@Injectable()
export class DiscoveryService implements OnModuleInit, OnApplicationBootstrap, OnModuleDestroy {
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private cachedManifest: ServiceManifestDto | null = null;

  @Inject(DISCOVERY_MODULE_OPTIONS)
  private readonly resolvedOptions: DiscoveryModuleOptions;

  @Optional()
  @Inject(EventLoggerService)
  private readonly logger: EventLoggerService | undefined;

  constructor(
    private readonly manifestService: ManifestService,
    private readonly schemaGenerator: SchemaGenerator,
    private readonly eventPublisher: DiscoveryEventPublisher,
  ) {}

  onModuleInit(): void {
    if (!this.resolvedOptions.enabled) return;
    if (!this.resolvedOptions.registerOnStartup) return;
    const manifest = this.manifestService.generateManifest(this.resolvedOptions.service);
    this.schemaGenerator.generateSchemasForManifest(manifest);
    this.cachedManifest = manifest;
    const resolvedLogger = this.logger ?? new EventLoggerService();
    resolvedLogger.logDiscoveryManifest(manifest as unknown as Record<string, unknown>);
    resolvedLogger.logEventEmitted({
      eventId: 'discovery-startup',
      eventType: 'discovery.service.initialized',
      subject: 'discovery.lifecycle',
    });
  }

  async onApplicationBootstrap(): Promise<void> {
    if (!this.shouldPublishEvents()) return;
    const manifest = this.getOrGenerateManifest();
    await this.eventPublisher.publishRegistration(manifest);
    this.startHeartbeat(manifest);
  }

  onModuleDestroy(): void {
    this.stopHeartbeat();
    if (!this.shouldPublishEvents()) return;
    const manifest = this.cachedManifest;
    if (!manifest) return;
    // Best-effort: fire-and-forget the shutdown event
    void this.eventPublisher.publishShutdown(manifest);
  }

  private shouldPublishEvents(): boolean {
    return this.resolvedOptions.enabled && this.resolvedOptions.registerOnStartup;
  }

  private getOrGenerateManifest(): ServiceManifestDto {
    if (this.cachedManifest) return this.cachedManifest;
    this.cachedManifest = this.manifestService.generateManifest(this.resolvedOptions.service);
    return this.cachedManifest;
  }

  private startHeartbeat(manifest: ServiceManifestDto): void {
    const intervalMinutes = this.resolvedOptions.heartbeatIntervalMinutes;
    if (intervalMinutes <= 0) return;
    const intervalMs = intervalMinutes * 60 * 1000;
    this.heartbeatTimer = setInterval(() => {
      void this.emitHeartbeat(manifest);
    }, intervalMs);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private async emitHeartbeat(manifest: ServiceManifestDto): Promise<void> {
    // Re-generate manifest if full manifest is requested in heartbeat
    const payloadManifest = this.resolvedOptions.includeFullManifestInHeartbeat
      ? this.getOrGenerateManifest()
      : manifest;
    await this.eventPublisher.publishHeartbeat(payloadManifest);
  }
}
```

**Estimated lines**: ~90 lines. Well under 200.

**Key changes**:
- Implements `OnApplicationBootstrap` and `OnModuleDestroy` in addition to `OnModuleInit`.
- Caches the manifest in `cachedManifest` for reuse across lifecycle hooks.
- `shouldPublishEvents()` extracted per single-section boolean rule.
- `DiscoveryEventPublisher` injected — handles all NATS publishing.
- Heartbeat timer managed with `setInterval`/`clearInterval`.
- `onModuleDestroy` clears heartbeat and publishes shutdown event (best-effort, `void` prefix).

---

### Step 7: Modify `src/discovery/discovery.module.ts`

Add `DiscoveryEventPublisher` to providers and exports.

**Changes**:
1. Import `DiscoveryEventPublisher` from `./events/discovery-event-publisher.service`.
2. Add `DiscoveryEventPublisher` to both `forRoot` and `forRootAsync` providers arrays.
3. Add `DiscoveryEventPublisher` to exports array.

In `forRoot()`:
```typescript
const providers = [
  { provide: DISCOVERY_MODULE_OPTIONS, useValue: resolvedOptions },
  DiscoveryService,
  ManifestService,
  MANIFEST_DEPS_FACTORY,
  SCHEMA_GENERATOR_PROVIDER,
  DiscoveryEventPublisher,
];
const exported = [DiscoveryService, ManifestService, SchemaGenerator, DiscoveryEventPublisher];
```

Same change in `forRootAsync()`.

**Estimated lines after change**: ~140 lines (from 132). Under 200.

---

### Step 8: Modify `src/discovery/index.ts`

Add exports for new event-related symbols.

```typescript
export { DiscoveryEventPublisher } from './events/discovery-event-publisher.service';
export { PLATFORM_REGISTER_SUBJECT, PLATFORM_HEARTBEAT_SUBJECT, PLATFORM_SHUTDOWN_SUBJECT } from './events/platform-event-subjects';
export { PlatformEventType } from './events/platform-event-types';
export { ServiceHeartbeatPayload, ServiceShutdownPayload, PLATFORM_COMPANY_ID, PLATFORM_ACTOR_ID } from './events/discovery-payloads.interface';
```

---

### Step 9: Modify `src/index.ts`

No new top-level exports needed — the event types and publisher are already re-exported via `src/discovery/index.ts` which is barrel-exported from `src/index.ts`.

However, verify that `DiscoveryEventPublisher` and the payload interfaces are useful for consumers. If consumers may want to subscribe to these subjects, the subject constants should be exported. They already will be via the discovery barrel.

---

### Step 10: Create unit tests for `DiscoveryEventPublisher`

File: `src/discovery/events/discovery-event-publisher.service.spec.ts`

Test cases:
1. `publishRegistration` — calls `ProducerService.publish` with `PLATFORM_REGISTER_SUBJECT` and correct envelope structure.
2. `publishHeartbeat` without full manifest — calls `publish` with `PLATFORM_HEARTBEAT_SUBJECT` and lightweight payload (no manifest field).
3. `publishHeartbeat` with full manifest — includes `manifest` in payload when `includeFullManifestInHeartbeat` is true.
4. `publishShutdown` — calls `publish` with `PLATFORM_SHUTDOWN_SUBJECT` and `ServiceShutdownPayload`.
5. `publishRegistration` when `ProducerService` is null — does not throw, silently skips.
6. `publishOrLog` catches errors from `ProducerService.publish` and does not re-throw.

---

### Step 11: Create unit tests for `DiscoveryService` lifecycle hooks

File: `src/discovery/discovery.service.spec.ts` (update existing or create new)

Test cases:
1. `onModuleInit` — existing behavior verified (generates manifest, logs).
2. `onApplicationBootstrap` with `registerOnStartup: true` — calls `eventPublisher.publishRegistration` once.
3. `onApplicationBootstrap` with `registerOnStartup: false` — does not call `publishRegistration`.
4. `onApplicationBootstrap` with `enabled: false` — does nothing.
5. `onApplicationBootstrap` with `heartbeatIntervalMinutes: 5` — starts heartbeat timer, calls `publishHeartbeat` on interval.
6. `onApplicationBootstrap` with `heartbeatIntervalMinutes: 0` — does not start heartbeat timer.
7. `onModuleDestroy` — clears heartbeat timer, calls `publishShutdown`.
8. Verify `cachedManifest` is reused across hooks.

---

### Step 12: Build & Type Check

```bash
npm run build
npm run typecheck  # if available
npm run lint
```

Fix any type errors or lint issues.

---

### Step 13: Run Tests

```bash
npm run test
```

Ensure all existing and new tests pass.

---

## File Summary

| # | File | Action | Est. Lines |
|---|------|--------|-----------|
| 1 | `src/discovery/events/platform-event-subjects.ts` | Create | ~15 |
| 2 | `src/discovery/events/discovery-payloads.interface.ts` | Create | ~35 |
| 3 | `src/discovery/events/platform-event-types.ts` | Create | ~7 |
| 4 | `src/discovery/events/discovery-event-publisher.service.ts` | Create | ~100 |
| 5 | `src/discovery/events/index.ts` | Create | ~6 |
| 6 | `src/discovery/discovery.service.ts` | Modify | ~90 (from 42) |
| 7 | `src/discovery/discovery.module.ts` | Modify | ~140 (from 132) |
| 8 | `src/discovery/index.ts` | Modify | ~36 (from 31) |
| 9 | `src/discovery/events/discovery-event-publisher.service.spec.ts` | Create | ~120 |
| 10 | `src/discovery/discovery.service.spec.ts` | Create/Update | ~150 |

All files respect the 200-line limit, 50-line method limit, 2-parameter limit, and 2-indentation-level limit.

---

## Verification Checklist

- [ ] `DiscoveryService` implements `OnApplicationBootstrap` and `OnModuleDestroy`
- [ ] `platform.service.register.v1` emitted on bootstrap when `registerOnStartup` is true
- [ ] `platform.service.heartbeat.v1` emitted on configurable interval
- [ ] `platform.service.shutdown.v1` emitted on module destroy
- [ ] `ProducerService` injected optionally — no crash if unavailable
- [ ] Heartbeat timer correctly started/stopped
- [ ] `includeFullManifestInHeartbeat` controls heartbeat payload content
- [ ] All files under 200 lines
- [ ] All methods under 50 lines
- [ ] Max 2 parameters per method
- [ ] Max 2 indentation levels
- [ ] No commented-out code
- [ ] Self-documenting code (minimal comments)
- [ ] Private members by default
- [ ] Unit tests for all new behavior