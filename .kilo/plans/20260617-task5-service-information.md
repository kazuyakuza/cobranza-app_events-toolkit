# Task 5: Service Information — Implementation Plan

## Objective

Automatically read `name`, `version`, `description` from `package.json`, generate `instanceId`, and allow overrides via `EventsToolkitDiscoveryOptions`.

## Current State Analysis

### Already Implemented (from Task 2)

| File | Status |
|------|--------|
| `src/discovery/service-info.interface.ts` | ✅ `ServiceInfo` interface with `name`, `version`, `description?`, `instanceId?` |
| `src/discovery/instance-id.utils.ts` | ✅ `generateInstanceId()` producing `inst_<uuid>` |
| `src/discovery/discovery-service-options.interface.ts` | ⚠️ `service?: ServiceInfo` — all fields required, no override support |
| `src/discovery/discovery.service.ts` | ⚠️ Falls back to `{ name: 'unknown', version: '0.0.0' }` — no package.json reading |
| `src/discovery/discovery.module.ts` | ⚠️ Passes `service` through as-is — no resolution from package.json |
| `src/discovery/manifest.service.ts` | ✅ Uses `serviceInfo.instanceId ?? generateInstanceId()` |

### Missing / Needs Change

1. **No package.json reading** — `DiscoveryService.onModuleInit()` uses `?? { name: 'unknown', version: '0.0.0' }` instead of reading actual package info.
2. **No override type** — `EventsToolkitDiscoveryOptions.service` is `ServiceInfo?` (name/version required), but overrides should have all fields optional.
3. **No ServiceInfo resolution logic** — need a dedicated resolver that reads package.json → merges overrides → generates instanceId.

## Implementation Plan

---

### Step 1: Create `src/discovery/service-info-overrides.interface.ts`

**New file.** Defines a type where all fields are optional for user overrides.

```typescript
/** Override values for service identity metadata. All fields optional. */
export interface ServiceInfoOverrides {
  /** Override service name (defaults to package.json "name"). */
  name?: string;
  /** Override service version (defaults to package.json "version"). */
  version?: string;
  /** Override service description (defaults to package.json "description"). */
  description?: string;
  /** Override instance identifier (auto-generated if omitted). */
  instanceId?: string;
}
```

**Constraints check**: ~10 lines ✓ | max 2 params/interface ✓

---

### Step 2: Create `src/discovery/package-info-reader.utils.ts`

**New file.** Utility function to read `name`, `version`, `description` from `package.json`.

```typescript
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

/** Represents the service-relevant fields extracted from package.json. */
export interface PackageInfo {
  name: string;
  version: string;
  description?: string;
}

const UNKNOWN_SERVICE = { name: 'unknown', version: '0.0.0' };

/** Reads service-relevant fields from the nearest package.json. */
export function readPackageInfo(packageJsonPath?: string): PackageInfo {
  const resolvedPath = packageJsonPath ?? join(process.cwd(), 'package.json');
  if (!existsSync(resolvedPath)) {
    return UNKNOWN_SERVICE;
  }
  try {
    const raw = readFileSync(resolvedPath, 'utf-8');
    const data = JSON.parse(raw) as Record<string, unknown>;
    return {
      name: typeof data.name === 'string' ? data.name : UNKNOWN_SERVICE.name,
      version: typeof data.version === 'string' ? data.version : UNKNOWN_SERVICE.version,
      description: typeof data.description === 'string' ? data.description : undefined,
    };
  } catch {
    return UNKNOWN_SERVICE;
  }
}
```

**Constraints check**: ~25 lines ✓ | `readPackageInfo(1 param)` ✓ | max 2 depth ✓

---

### Step 3: Create `src/discovery/service-info.resolver.ts`

**New file.** Resolves a complete `ServiceInfo` by merging package.json data with user overrides and generating `instanceId`.

```typescript
import { ServiceInfo } from './service-info.interface';
import { ServiceInfoOverrides } from './service-info-overrides.interface';
import { readPackageInfo, PackageInfo } from './package-info-reader.utils';
import { generateInstanceId } from './instance-id.utils';

/** Resolves service identity by merging package.json defaults with user overrides. */
export function resolveServiceInfo(overrides?: ServiceInfoOverrides): ServiceInfo {
  const packageInfo: PackageInfo = readPackageInfo();
  return {
    name: overrides?.name ?? packageInfo.name,
    version: overrides?.version ?? packageInfo.version,
    description: overrides?.description ?? packageInfo.description,
    instanceId: overrides?.instanceId ?? generateInstanceId(),
  };
}
```

**Constraints check**: ~14 lines ✓ | `resolveServiceInfo(1 param)` ✓ | max 2 depth ✓

---

### Step 4: Modify `src/discovery/discovery-service-options.interface.ts`

**Change**: Replace `ServiceInfo` import with `ServiceInfoOverrides` import for the `service` field.

**Before**:
```typescript
import { ServiceInfo } from './service-info.interface';
...
  /** Service identity metadata for the discovery manifest. */
  service?: ServiceInfo;
```

**After**:
```typescript
import { ServiceInfoOverrides } from './service-info-overrides.interface';
...
  /** Service identity overrides for the discovery manifest. Auto-resolved from package.json if omitted. */
  service?: ServiceInfoOverrides;
```

**Constraints check**: Net lines unchanged ✓

---

### Step 5: Modify `src/discovery/discovery.module.ts`

**Changes**:
1. Import `resolveServiceInfo` and `ServiceInfo` (instead of using `ServiceInfo` from options).
2. Change `DiscoveryModuleOptions.service` from `ServiceInfo?` to `ServiceInfo` (required).
3. In `resolveDiscoveryOptions()`, call `resolveServiceInfo(userOptions.service)` instead of passing `userOptions.service` directly.
4. Remove `service` from `DEFAULT_DISCOVERY_OPTIONS` (no longer needed as a default).
5. Update imports: add `resolveServiceInfo`, replace `ServiceInfo` import with `ServiceInfoOverrides` if needed.

**Before** (key sections):
```typescript
import { ServiceInfo } from './service-info.interface';
...
export interface DiscoveryModuleOptions {
  ...
  service?: ServiceInfo;
  ...
}

const DEFAULT_DISCOVERY_OPTIONS: DiscoveryModuleOptions = {
  ...
  // service not present
};

function resolveDiscoveryOptions(userOptions: EventsToolkitDiscoveryOptions): DiscoveryModuleOptions {
  return {
    ...
    service: userOptions.service,
    ...
  };
}
```

**After**:
```typescript
import { ServiceInfo } from './service-info.interface';
import { resolveServiceInfo } from './service-info.resolver';
...
export interface DiscoveryModuleOptions {
  ...
  service: ServiceInfo;
  ...
}

const DEFAULT_DISCOVERY_OPTIONS = {
  enabled: true as const,
  registerOnStartup: true as const,
  heartbeatIntervalMinutes: 0 as const,
  includeFullManifestInHeartbeat: false as const,
  schemaDir: '.events-toolkit/schemas',
  forceRegenerateSchemas: false as const,
};

function resolveDiscoveryOptions(userOptions: EventsToolkitDiscoveryOptions): DiscoveryModuleOptions {
  return {
    enabled: userOptions.enabled ?? DEFAULT_DISCOVERY_OPTIONS.enabled,
    registerOnStartup: userOptions.registerOnStartup ?? DEFAULT_DISCOVERY_OPTIONS.registerOnStartup,
    heartbeatIntervalMinutes:
      userOptions.heartbeatIntervalMinutes ?? DEFAULT_DISCOVERY_OPTIONS.heartbeatIntervalMinutes,
    includeFullManifestInHeartbeat:
      userOptions.includeFullManifestInHeartbeat ?? DEFAULT_DISCOVERY_OPTIONS.includeFullManifestInHeartbeat,
    service: resolveServiceInfo(userOptions.service),
    schemaDir: userOptions.schemaDir ?? DEFAULT_DISCOVERY_OPTIONS.schemaDir,
    forceRegenerateSchemas: userOptions.forceRegenerateSchemas ?? DEFAULT_DISCOVERY_OPTIONS.forceRegenerateSchemas,
  };
}
```

**Constraints check**: ~135 lines (within 200 limit) ✓ | `resolveDiscoveryOptions(1 param)` ✓

---

### Step 6: Modify `src/discovery/discovery.service.ts`

**Change**: Remove the `?? { name: 'unknown', version: '0.0.0' }` fallback since `service` is now guaranteed to be a `ServiceInfo`.

**Before**:
```typescript
const manifest: ServiceManifestDto = this.manifestService.generateManifest(
  this.resolvedOptions.service ?? { name: 'unknown', version: '0.0.0' },
);
```

**After**:
```typescript
const manifest: ServiceManifestDto = this.manifestService.generateManifest(
  this.resolvedOptions.service,
);
```

Also check if `Optional` import on `EventLoggerService` is still used — it is, so keep it. No other changes needed.

**Constraints check**: ~42 lines ✓

---

### Step 7: Update `src/discovery/index.ts`

**Add exports** for new files:

```typescript
export { ServiceInfoOverrides } from './service-info-overrides.interface';
export { resolveServiceInfo } from './service-info.resolver';
export { readPackageInfo, PackageInfo } from './package-info-reader.utils';
```

**Constraints check**: ~31 lines ✓

---

### Step 8: Run typecheck

```bash
npm run typecheck
```

Verify no type errors from the changes.

### Step 9: Run lint

```bash
npm run lint
```

### Step 10: Run tests

```bash
npm run test
```

---

## Summary of Changes

| Action | File | Description |
|--------|------|-------------|
| CREATE | `src/discovery/service-info-overrides.interface.ts` | Override type with all optional fields |
| CREATE | `src/discovery/package-info-reader.utils.ts` | Reads name/version/description from package.json |
| CREATE | `src/discovery/service-info.resolver.ts` | Merges package.json + overrides + generates instanceId |
| MODIFY | `src/discovery/discovery-service-options.interface.ts` | `service?: ServiceInfo` → `service?: ServiceInfoOverrides` |
| MODIFY | `src/discovery/discovery.module.ts` | Use `resolveServiceInfo()` in `resolveDiscoveryOptions()`, `service` now `ServiceInfo` (required) |
| MODIFY | `src/discovery/discovery.service.ts` | Remove fallback `{ name: 'unknown', version: '0.0.0' }` |
| MODIFY | `src/discovery/index.ts` | Export new types and functions |

## Data Flow

```
User provides EventsToolkitDiscoveryOptions (service?: ServiceInfoOverrides)
  │
  ▼
resolveDiscoveryOptions()
  │ calls resolveServiceInfo(userOptions.service)
  │
  ▼
resolveServiceInfo(overrides?)
  │ ├── readPackageInfo() → { name, version, description } from package.json
  │ ├── apply overrides (name/version/description/instanceId)
  │ └── generateInstanceId() if instanceId not provided
  │
  ▼
DiscoveryModuleOptions.service: ServiceInfo (always populated)
  │
  ▼
DiscoveryService.resolvedOptions.service → ManifestService.generateManifest()
```