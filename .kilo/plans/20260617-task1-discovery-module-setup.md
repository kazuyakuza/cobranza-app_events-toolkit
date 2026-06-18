# Plan: Discovery Module Setup

## Task Overview

Create `src/discovery/` module directory with `DiscoveryModule` and `DiscoveryService`, plus add `discovery` configuration options to `EventsToolkitModule.forRoot()`.

## Pre-Analysis

### Current State

- `EventsToolkitModuleOptions` (in `src/events-toolkit-options.interface.ts`) accepts `nats`, `outbox`, `logging`, `consumer`.
- `EventsToolkitModule.forRoot()` conditionally imports `ConsumerModule` (when `consumer.enable !== false`) and `OutboxModule` (when `outbox` is provided).
- `DiscoveryModule` is a NestJS dynamic module that needs to follow the same conditional-import pattern.
- `events-toolkit.module.ts` is currently 208 lines (already exceeds 200-line rule). Adding ~15-20 lines for discovery will make it ~225. This pre-existing violation should be addressed in a separate task.

### Design Decisions

1. **Options interface naming**: `EventsToolkitDiscoveryOptions` (top-level, added to `EventsToolkitModuleOptions`) — follows the `EventsToolkit*Options` naming pattern.
2. **Module options interface**: `DiscoveryModuleOptions` (internal to the module, resolved with defaults) — follows the `ConsumerModuleOptions` / `OutboxModuleOptions` pattern.
3. **Injection token**: `DISCOVERY_MODULE_OPTIONS` constant — follows the `CONSUMER_MODULE_OPTIONS` / `EVENTS_TOOLKIT_OPTIONS` pattern.
4. **Default values applied in module**: The `resolveDiscoveryOptions()` helper merges user options with defaults, consistent with how other modules handle defaults.
5. **Conditional import**: `DiscoveryModule` is imported only when `discovery?.enabled !== false`, consistent with `ConsumerModule`'s `enable` pattern.
6. **forRoot-only for now**: The shell service doesn't need NATS or async dependencies yet. `forRootAsync` will be added in a future task when discovery functionality requires runtime config resolution.
7. **DiscoveryService as shell**: Injectable with injected options token. Contains `onModuleInit` lifecycle hook placeholder. No manifest state or heartbeat logic yet — those will be added incrementally.
8. **Private members by default**: Service properties are private; only `onModuleInit` is public (required by NestJS `OnModuleInit`).

---

## Implementation Steps

### Step 1: Create `src/discovery/discovery-service-options.interface.ts`

**File**: `src/discovery/discovery-service-options.interface.ts`

```ts
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
}

/** Injection token for DiscoveryModule resolved options. */
export const DISCOVERY_MODULE_OPTIONS = 'DISCOVERY_MODULE_OPTIONS';
```

**Lines**: ~14. Complies with all rules.

---

### Step 2: Create `src/discovery/discovery.module.ts`

**File**: `src/discovery/discovery.module.ts`

```ts
import { DynamicModule, Module } from '@nestjs/common';
import {
  DISCOVERY_MODULE_OPTIONS,
  EventsToolkitDiscoveryOptions,
} from './discovery-service-options.interface';
import { DiscoveryService } from './discovery.service';

/** Resolved options used internally by DiscoveryModule providers. */
export interface DiscoveryModuleOptions {
  registerOnStartup: boolean;
  heartbeatIntervalMinutes: number;
  includeFullManifestInHeartbeat: boolean;
}

const DEFAULT_DISCOVERY_OPTIONS: DiscoveryModuleOptions = {
  registerOnStartup: true,
  heartbeatIntervalMinutes: 0,
  includeFullManifestInHeartbeat: false,
};

function resolveDiscoveryOptions(
  userOptions: EventsToolkitDiscoveryOptions,
): DiscoveryModuleOptions {
  return {
    registerOnStartup: userOptions.registerOnStartup ?? DEFAULT_DISCOVERY_OPTIONS.registerOnStartup,
    heartbeatIntervalMinutes: userOptions.heartbeatIntervalMinutes ?? DEFAULT_DISCOVERY_OPTIONS.heartbeatIntervalMinutes,
    includeFullManifestInHeartbeat: userOptions.includeFullManifestInHeartbeat ?? DEFAULT_DISCOVERY_OPTIONS.includeFullManifestInHeartbeat,
  };
}

/** NestJS dynamic module for service discovery and manifest registration. */
@Module({})
export class DiscoveryModule {
  static forRoot(options: EventsToolkitDiscoveryOptions): DynamicModule {
    const resolvedOptions = resolveDiscoveryOptions(options);

    return {
      module: DiscoveryModule,
      global: true,
      providers: [
        { provide: DISCOVERY_MODULE_OPTIONS, useValue: resolvedOptions },
        DiscoveryService,
      ],
      exports: [DiscoveryService],
    };
  }
}
```

**Lines**: ~52. Complies with all rules (max 200 per file, max 50 per method, max 2 params, max 2 indentation levels).

---

### Step 3: Create `src/discovery/discovery.service.ts`

**File**: `src/discovery/discovery.service.ts`

```ts
import { Injectable, Inject, OnModuleInit } from '@nestjs/common';
import { DISCOVERY_MODULE_OPTIONS } from './discovery-service-options.interface';
import { DiscoveryModuleOptions } from './discovery.module';
import { EventLoggerService } from '../logging/event-logger.service';

@Injectable()
export class DiscoveryService implements OnModuleInit {
  private readonly resolvedOptions: DiscoveryModuleOptions;
  private readonly logger: EventLoggerService;

  constructor(
    @Inject(DISCOVERY_MODULE_OPTIONS) options: DiscoveryModuleOptions,
    logger: EventLoggerService,
  ) {
    this.resolvedOptions = options;
    this.logger = logger;
  }

  onModuleInit(): void {
    if (!this.resolvedOptions.registerOnStartup) {
      return;
    }
    this.logger.logEventEmitted({
      eventId: 'discovery-startup',
      eventType: 'discovery.service.initialized',
      subject: 'discovery.lifecycle',
    });
  }
}
```

**Lines**: ~29. Complies with all rules.

**Note**: `logEventEmitted` is used as a temporary logging mechanism. When discovery-specific logging methods are added to `EventLoggerService`, this placeholder will be replaced.

---

### Step 4: Create `src/discovery/index.ts`

**File**: `src/discovery/index.ts`

```ts
/**
 * @packageDocumentation
 * Discovery module — service manifest registration and heartbeat for event discovery.
 */

export { DiscoveryModule, DiscoveryModuleOptions } from './discovery.module';
export { DiscoveryService } from './discovery.service';
export {
  DISCOVERY_MODULE_OPTIONS,
  EventsToolkitDiscoveryOptions,
} from './discovery-service-options.interface';
```

**Lines**: ~10. Complies.

---

### Step 5: Modify `src/events-toolkit-options.interface.ts`

Add `EventsToolkitDiscoveryOptions` import and `discovery` property to `EventsToolkitModuleOptions`.

**Current** `EventsToolkitModuleOptions` (lines 43-53):
```ts
export interface EventsToolkitModuleOptions {
  nats: EventsToolkitNatsOptions;
  outbox?: EventsToolkitOutboxOptions;
  logging?: EventsToolkitLoggingOptions;
  consumer?: EventsToolkitConsumerOptions;
}
```

**Change**: Add import and property:

- Add at top (after line 3): `import { EventsToolkitDiscoveryOptions } from './discovery/discovery-service-options.interface';`
- Add after `consumer?: EventsToolkitConsumerOptions;` (line 51): `  /** Discovery subsystem toggle and options. */` + `  discovery?: EventsToolkitDiscoveryOptions;`

**Resulting interface**:
```ts
export interface EventsToolkitModuleOptions {
  nats: EventsToolkitNatsOptions;
  outbox?: EventsToolkitOutboxOptions;
  logging?: EventsToolkitLoggingOptions;
  consumer?: EventsToolkitConsumerOptions;
  /** Discovery subsystem toggle and options. */
  discovery?: EventsToolkitDiscoveryOptions;
}
```

---

### Step 6: Modify `src/events-toolkit.module.ts`

Add conditional `DiscoveryModule` import in `forRoot()` and `forRootAsync()`.

**Add imports** (at top of file):
```ts
import { DiscoveryModule } from './discovery/discovery.module';
import { EventsToolkitDiscoveryOptions } from './discovery/discovery-service-options.interface';
```

**Add after OutboxModule import** (after line 6):
```ts
import { DiscoveryModule } from './discovery/discovery.module';
import { EventsToolkitDiscoveryOptions } from './discovery/discovery-service-options.interface';
```

**In `forRoot()` method**, after the outbox import block (after line 91 `imports.push(OutboxModule.forRoot(outboxOpts));`), add:

```ts
    const discoveryEnabled = options.discovery?.enabled !== false;
    if (discoveryEnabled) {
      const discoveryOpts = options.discovery ?? {};
      imports.push(DiscoveryModule.forRoot(discoveryOpts));
    }
```

**In `forRoot()` return object**, add `DiscoveryService` to exports array (line 100):
```ts
exports: [ProducerService, ConsumerService, OutboxService, EventLoggerService, DiscoveryService],
```

Need to also add the import for `DiscoveryService`:
```ts
import { DiscoveryService } from './discovery/discovery.service';
```

**In `forRootAsync()` method**, modify the `imports` array (lines 113-118) to include `DiscoveryModule`:
```ts
    const imports: ModuleImport[] = [
      ProducerModule.forRootAsync({ useExisting: JETSTREAM_TOKEN, useFactory: async () => ({}), inject: [] }),
      buildConsumerAsyncImport(),
      buildOutboxAsyncImport(),
      ...(asyncOptions.imports ?? []),
    ];
```

Add `buildDiscoveryAsyncImport()` to the imports array:
```ts
    const imports: ModuleImport[] = [
      ProducerModule.forRootAsync({ useExisting: JETSTREAM_TOKEN, useFactory: async () => ({}), inject: [] }),
      buildConsumerAsyncImport(),
      buildOutboxAsyncImport(),
      buildDiscoveryAsyncImport(),
      ...(asyncOptions.imports ?? []),
    ];
```

**Add `buildDiscoveryAsyncImport()` helper function** (after `buildOutboxAsyncImport` near line 208):
```ts
function buildDiscoveryAsyncImport(): DynamicModule {
  return DiscoveryModule.forRoot({});
}
```

**In `forRootAsync()` return object**, add `DiscoveryService` to exports array (line 125):
```ts
exports: [ProducerService, ConsumerService, OutboxService, EventLoggerService, DiscoveryService],
```

---

### Step 7: Modify `src/index.ts`

Add discovery barrel export after the Outbox section:

```ts
// ── Discovery ──
export * from './discovery';
```

Also add `EventsToolkitDiscoveryOptions` to the explicit exports from `events-toolkit-options.interface`:
```ts
export {
  EventsToolkitModuleOptions,
  EventsToolkitModuleAsyncOptions,
  EventsToolkitNatsOptions,
  EventsToolkitOutboxOptions,
  EventsToolkitLoggingOptions,
  EventsToolkitConsumerOptions,
  EventsToolkitDiscoveryOptions,
} from './events-toolkit-options.interface';
```

---

### Step 8: Update `.agent/project-structure.md`

Add under `# Folders in src/`:
```
- discovery/ - DiscoveryModule, DiscoveryService, manifest registration and heartbeat (barrel: index.ts)
```

---

### Step 9: Build Verification

After all changes:

1. Run `npm run build` to verify TypeScript compilation succeeds with no errors.
2. Run `npm run test` to verify existing tests still pass (no regressions).
3. Run `npm run lint` to verify lint compliance.

---

### Step 10: Commit

```bash
git add src/discovery/ src/events-toolkit-options.interface.ts src/events-toolkit.module.ts src/index.ts .agent/project-structure.md
git commit -m "feat: add discovery module shell with configuration options"
```

---

## File Change Summary

| # | File | Action | ~Lines |
|---|------|--------|--------|
| 1 | `src/discovery/discovery-service-options.interface.ts` | CREATE | ~14 |
| 2 | `src/discovery/discovery.module.ts` | CREATE | ~52 |
| 3 | `src/discovery/discovery.service.ts` | CREATE | ~29 |
| 4 | `src/discovery/index.ts` | CREATE | ~10 |
| 5 | `src/events-toolkit-options.interface.ts` | MODIFY | +2 |
| 6 | `src/events-toolkit.module.ts` | MODIFY | +20 |
| 7 | `src/index.ts` | MODIFY | +3 |
| 8 | `.agent/project-structure.md` | MODIFY | +1 |

## Compliance Notes

- **Max 200 lines per file**: All new files comply. Modified `events-toolkit.module.ts` will be ~230 lines — pre-existing violation; recommend a follow-up task to extract helper functions.
- **Max 50 lines per method**: All methods comply.
- **Max 2 params per method**: `resolveDiscoveryOptions(1 param)`, `DiscoveryModule.forRoot(1 param)`, `DiscoveryService constructor(2 params)`. All comply.
- **Max 2 indentation levels**: All code stays within 2 indentation levels from the start of each method body.
- **Private members by default**: DiscoveryService properties are private; only `onModuleInit` is public (NestJS lifecycle).
- **Self-documenting code**: No comments other than JSDoc on public interfaces/classes.
- **No commented-out code**: None.
- **Project structure**: New `src/discovery/` directory matches existing module layout.