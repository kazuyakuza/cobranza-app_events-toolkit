# Task 7: HTTP Endpoints — Implementation Plan

## Objective

Create `src/discovery/discovery.controller.ts` with `GET /manifest` and `GET /schemas` endpoints, register it in `DiscoveryModule`, and add unit tests.

## Pre-Analysis

### Current State

- **No controllers exist yet** in the project. This is the first NestJS controller.
- `ManifestService.generateManifest(serviceInfo: ServiceInfo)` returns `ServiceManifestDto` but requires a `ServiceInfo` parameter.
- `DiscoveryService` already caches the manifest in a private `cachedManifest` field and has `getOrGenerateManifest()` (private) that lazily generates it.
- `SchemaGenerator.getAllSchemas()` returns `SchemaCollection` (`Record<string, JsonSchemaObject>`) with internal caching.
- `DiscoveryModule` uses dynamic module patterns (`forRoot`, `forRootAsync`) — controller must be registered in both.
- `DISCOVERY_MODULE_OPTIONS` token holds resolved `DiscoveryModuleOptions` including `service: ServiceInfo`.

### Design Decision

**Use `DiscoveryService` for the manifest endpoint** rather than injecting `ManifestService` + `DISCOVERY_MODULE_OPTIONS` separately. Reasons:
- `DiscoveryService` already manages the cached manifest and lazy generation.
- Avoids duplicate caching logic in the controller.
- Requires only one new public method on `DiscoveryService` instead of two injected dependencies.

**Use `SchemaGenerator` directly for the schemas endpoint** because the service already handles caching and persistence internally.

---

## Implementation Steps

### Step 1: Add public `getManifest()` method to `DiscoveryService`

**File**: `src/discovery/discovery.service.ts`

**Change**: Add a public method that exposes the manifest, reusing the existing private `getOrGenerateManifest()` logic.

```typescript
/** Returns the service manifest, generating it on first access if not yet cached. */
getManifest(): ServiceManifestDto {
  return this.getOrGenerateManifest();
}
```

**Location**: Add after the `onModuleDestroy()` method (line 76), before `shouldPublishEvents()` (line 79).

**Impact**: This method makes the private `getOrGenerateManifest()` accessible publicly without duplicating logic. The `getOrGenerateManifest()` method remains private; `getManifest()` is the public API.

### Step 2: Create `DiscoveryController`

**File**: `src/discovery/discovery.controller.ts` (NEW)

```typescript
import { Controller, Get } from '@nestjs/common';
import { DiscoveryService } from './discovery.service';
import { SchemaGenerator } from './utils/schema-generator';
import { ServiceManifestDto } from './dto/service-manifest.dto';
import { SchemaCollection } from './utils/schema-types.interface';

@Controller('discovery')
export class DiscoveryController {
  constructor(
    private readonly discoveryService: DiscoveryService,
    private readonly schemaGenerator: SchemaGenerator,
  ) {}

  @Get('manifest')
  getManifest(): ServiceManifestDto {
    return this.discoveryService.getManifest();
  }

  @Get('schemas')
  getSchemas(): SchemaCollection {
    return this.schemaGenerator.getAllSchemas();
  }
}
```

**Lines**: ~20 — well within 200-line limit.
**Method lines**: 1 body line each — well within 50-line limit.
**Indentation**: 1 level in class, 1 level in methods — within 2-level limit.
**Params per method**: Constructor has 2 params (injection). Handler methods have 0 params.

### Step 3: Register `DiscoveryController` in `DiscoveryModule`

**File**: `src/discovery/discovery.module.ts`

**Changes**:

1. Add import at top (after line 10, near other imports):
```typescript
import { DiscoveryController } from './discovery.controller';
```

2. In `forRoot()` method (around line 103), add `controllers` to the return object:
```typescript
return {
  module: DiscoveryModule,
  global: true,
  providers,
  exports: exported,
  controllers: [DiscoveryController],
};
```

3. In `forRootAsync()` method (around line 131), add `controllers` to the return object:
```typescript
return {
  module: DiscoveryModule,
  global: true,
  providers,
  exports: exported,
  imports: asyncOptions.imports ?? [],
  controllers: [DiscoveryController],
};
```

**Verification**: NestJS `DynamicModule` interface supports the `controllers` property.

### Step 4: Create unit tests for `DiscoveryController`

**File**: `src/discovery/discovery.controller.spec.ts` (NEW)

```typescript
import { DiscoveryController } from './discovery.controller';
import { DiscoveryService } from './discovery.service';
import { SchemaGenerator } from './utils/schema-generator';
import type { ServiceManifestDto } from './dto/service-manifest.dto';
import type { SchemaCollection } from './utils/schema-types.interface';

function createMockManifest(): ServiceManifestDto {
  return {
    name: 'test-service',
    version: '1.0.0',
    description: 'Test service',
    instanceId: 'test-instance',
    consumes: [],
    produces: [],
  };
}

function createMockSchemas(): SchemaCollection {
  return { TestDto: { title: 'TestDto', type: 'object' } };
}

function createMockDiscoveryService(manifest: ServiceManifestDto): DiscoveryService {
  return { getManifest: () => manifest } as unknown as DiscoveryService;
}

function createMockSchemaGenerator(schemas: SchemaCollection): SchemaGenerator {
  return { getAllSchemas: () => schemas } as unknown as SchemaGenerator;
}

describe('DiscoveryController', () => {
  describe('getManifest', () => {
    it('returns the service manifest from DiscoveryService', () => {
      const manifest = createMockManifest();
      const controller = new DiscoveryController(
        createMockDiscoveryService(manifest),
        createMockSchemaGenerator(createMockSchemas()),
      );
      const result = controller.getManifest();
      expect(result).toBe(manifest);
    });
  });

  describe('getSchemas', () => {
    it('returns all schemas from SchemaGenerator', () => {
      const schemas = createMockSchemas();
      const controller = new DiscoveryController(
        createMockDiscoveryService(createMockManifest()),
        createMockSchemaGenerator(schemas),
      );
      const result = controller.getSchemas();
      expect(result).toBe(schemas);
    });
  });
});
```

**Lines**: ~65 — within 200-line limit.
**Design**: Mocks are factory functions. Tests verify delegation to services.

### Step 5: Export `DiscoveryController` from barrel file

**File**: `src/discovery/index.ts`

Add after the `DiscoveryService` export (after line 7):

```typescript
export { DiscoveryController } from './discovery.controller';
```

### Step 6: Run build and type-check

```bash
npm run build
npm run typecheck
```

Verify no compilation or type errors.

### Step 7: Run unit tests

```bash
npm run test -- --grep "DiscoveryController"
```

Verify all tests pass.

### Step 8: Commit

```bash
git add src/discovery/discovery.controller.ts src/discovery/discovery.controller.spec.ts src/discovery/discovery.service.ts src/discovery/discovery.module.ts src/discovery/index.ts
git commit -m "feat(discovery): add HTTP endpoints for manifest and schemas"
```

---

## Files Summary

| Action | File | Description |
|--------|------|-------------|
| CREATE | `src/discovery/discovery.controller.ts` | NestJS controller with GET /manifest and GET /schemas |
| CREATE | `src/discovery/discovery.controller.spec.ts` | Unit tests for both endpoints |
| MODIFY | `src/discovery/discovery.service.ts` | Add public `getManifest()` method |
| MODIFY | `src/discovery/discovery.module.ts` | Register DiscoveryController in forRoot and forRootAsync |
| MODIFY | `src/discovery/index.ts` | Export DiscoveryController |

## Constraint Verification

| Constraint | Status |
|------------|--------|
| Max 200 lines per file | ✅ All files under 70 lines |
| Max 50 lines per method | ✅ All methods 1-3 lines |
| Max 2 indentation levels | ✅ Controller body at 1 level |
| Max 2 params per method | ✅ Constructor 2 params, handlers 0 params |
| Private members by default | ✅ Private readonly injected services |
| Self-documenting code | ✅ Clear names, NestJS decorators |
| No commented-out code | ✅ No comments needed |