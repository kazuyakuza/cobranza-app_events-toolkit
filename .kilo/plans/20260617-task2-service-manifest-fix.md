# Task 2: Service Manifest & Schema References — Fix Plan

## Issues Found

### 1. Incorrect `payloadSchemaRef` extraction for `@EmitEvent` producers
- **Severity**: High
- **Files**: `src/discovery/manifest.service.ts` (lines 133–149, 165–180)
- **Issue**: `extractPayloadSchemaRef` always prefers `design:paramtypes` before falling back to `design:returntype`. For `@EmitEvent` methods, the return value is the emitted event (e.g., `PaymentProofUploadedEvent`), while the first parameter is usually input data/context. The current logic extracts the wrong schema reference for producers.
- **Deviation from plan**: The plan specifies `design:paramtypes` for consumer handlers and `design:returntype` for producer methods.
- **Fix**: Add a `source` flag to `PayloadSchemaRefParams` so `buildEmitEventEntry` can request return-type-first extraction.

### 2. Lint / type-quality errors
- **Severity**: Medium
- **Files**: `src/discovery/manifest.service.ts`
- **Issues**:
  - 5 occurrences of banned `Function` type (lines 94, 114, 133, 182) — `@typescript-eslint/ban-types`.
  - 2 Prettier formatting violations (lines 86, 190).
- **Fix**: Replace `Function` with a narrow function type (e.g., `(...args: unknown[]) => unknown`) and run `npm run format` / `npm run lint:fix`.

### 3. Missing unit tests
- **Severity**: Medium
- **File**: `src/discovery/manifest.service.spec.ts` (does not exist)
- **Issue**: The implementation plan explicitly requires unit tests for `ManifestService`, but no spec file was created.
- **Fix**: Create `src/discovery/manifest.service.spec.ts` covering all scenarios listed in the implementation plan.

### 4. `DiscoveryService` constructor exceeds max 2 parameters
- **Severity**: Medium
- **File**: `src/discovery/discovery.service.ts` (lines 14–19)
- **Issue**: Constructor has 3 parameters (`options`, `logger`, `manifestService`), violating the max-arguments-per-method rule.
- **Fix**: Use property injection for the optional logger so the constructor accepts only 2 parameters.

### 5. `MANIFEST_DEPS_FACTORY` factory function exceeds max 2 parameters
- **Severity**: Medium
- **File**: `src/discovery/discovery.module.ts` (lines 30–36)
- **Issue**: The `useFactory` function injects 3 dependencies directly, violating the max-arguments rule.
- **Fix**: Convert the factory into an `@Injectable()` provider class that uses property injection for two dependencies and constructor injection for the third, keeping the constructor at 1 parameter.

### 6. Scan methods exceed max 2 nesting levels
- **Severity**: Medium
- **File**: `src/discovery/manifest.service.ts` (lines 48–81)
- **Issue**: `scanOnEventDecorators`, `scanOnRequestReplyDecorators`, and `scanEmitEventDecorators` each contain a `for` loop (level 1), an arrow callback (level 2), and an `if` block (level 3).
- **Fix**: Refactor each scanner to collect method names first, then build entries with chained `flatMap`/`map`/`filter` calls so block nesting stays at 2 levels.

### 7. Generated manifest is not logged on startup
- **Severity**: Low
- **File**: `src/discovery/discovery.service.ts` (lines 29–41)
- **Issue**: `onModuleInit` calls `manifestService.generateManifest(...)` but discards the result. The plan specifies logging the manifest.
- **Fix**: Capture the manifest and log it via `EventLoggerService` (extend the logger with a `logDiscoveryManifest` method or include the manifest in the existing `logEventEmitted` context).

---

## Implementation Steps

### Step 1: Fix `payloadSchemaRef` extraction for producers

1. In `src/discovery/manifest.service.ts`, update `PayloadSchemaRefParams`:

```typescript
interface PayloadSchemaRefParams {
  prototype: object;
  methodName: string;
  explicitRef?: string;
  preferReturnType?: boolean;
}
```

2. Update `extractPayloadSchemaRef` to honor the flag:

```typescript
private extractPayloadSchemaRef(params: PayloadSchemaRefParams): string {
  if (params.explicitRef) {
    return params.explicitRef;
  }
  if (params.preferReturnType) {
    const returnTypeName = this.extractReturnTypeName(params.prototype, params.methodName);
    if (returnTypeName) {
      return returnTypeName;
    }
    return this.extractParamTypeName(params.prototype, params.methodName);
  }
  const paramTypeName = this.extractParamTypeName(params.prototype, params.methodName);
  if (paramTypeName) {
    return paramTypeName;
  }
  return this.extractReturnTypeName(params.prototype, params.methodName);
}
```

3. In `buildEmitEventEntry`, pass `preferReturnType: true`.

### Step 2: Resolve lint errors

1. Define a narrow function type in `src/discovery/manifest.service.ts`:

```typescript
type AnyFunction = (...args: unknown[]) => unknown;
```

2. Replace `Record<string, Function>` with `Record<string, AnyFunction>` in the three build methods.
3. Replace the `Function` cast in `extractClassName` with `AnyFunction`.
4. Run `npm run format` and `npm run lint:fix` to resolve Prettier issues.
5. Run `npm run lint` to confirm zero errors.

### Step 3: Reduce nesting in scan methods

1. Add a helper that returns method names for an instance:

```typescript
private getMethodNames(instance: object): string[] {
  const methodNames: string[] = [];
  this.deps.metadataScanner.scanFromPrototype(
    instance,
    Object.getPrototypeOf(instance),
    (methodName) => methodNames.push(methodName),
  );
  return methodNames;
}
```

2. Refactor scanners using `flatMap` + `map` + `filter`:

```typescript
private scanOnEventDecorators(): ManifestConsumeEntry[] {
  return this.getValidInstances().flatMap((instance) =>
    this.getMethodNames(instance)
      .map((methodName) => this.buildOnEventEntry(instance, methodName))
      .filter((entry): entry is ManifestConsumeEntry => entry != null),
  );
}
```

3. Repeat for `scanOnRequestReplyDecorators` and `scanEmitEventDecorators`.

### Step 4: Reduce `DiscoveryService` constructor parameters

1. Use property injection for the optional logger:

```typescript
@Optional()
@Inject(EventLoggerService)
private readonly logger: EventLoggerService | undefined;

constructor(
  @Inject(DISCOVERY_MODULE_OPTIONS) options: DiscoveryModuleOptions,
  private readonly manifestService: ManifestService,
) {
  this.resolvedOptions = options;
}
```

2. In `onModuleInit`, resolve the logger with a fallback:

```typescript
const logger = this.logger ?? new EventLoggerService();
```

### Step 5: Reduce `MANIFEST_DEPS_FACTORY` factory parameters

1. Create an injectable provider class in `src/discovery/manifest-deps.provider.ts`:

```typescript
import { Injectable, Inject } from '@nestjs/common';
import { DiscoveryService, Reflector, MetadataScanner } from '@nestjs/core';
import { MANIFEST_SERVICE_DEPS_TOKEN, ManifestServiceDeps } from './manifest-deps.interface';

@Injectable()
export class ManifestServiceDepsProvider implements ManifestServiceDeps {
  @Inject(DiscoveryService)
  readonly discovery: DiscoveryService;

  @Inject(Reflector)
  readonly reflector: Reflector;

  constructor(readonly metadataScanner: MetadataScanner) {}
}
```

2. Replace `MANIFEST_DEPS_FACTORY` in `src/discovery/discovery.module.ts`:

```typescript
const MANIFEST_DEPS_FACTORY = {
  provide: MANIFEST_SERVICE_DEPS_TOKEN,
  useClass: ManifestServiceDepsProvider,
};
```

3. Add `ManifestServiceDepsProvider` to the providers array.

### Step 6: Log the generated manifest

1. Capture the manifest in `DiscoveryService.onModuleInit`:

```typescript
const manifest = this.manifestService.generateManifest(
  this.resolvedOptions.service ?? { name: 'unknown', version: '0.0.0' },
);
```

2. Log it via the resolved logger. For example, extend `EventLoggerService` with:

```typescript
logDiscoveryManifest(manifest: ServiceManifestDto): void {
  this.logger.info('Discovery manifest generated', { manifest });
}
```

3. Call `logger.logDiscoveryManifest(manifest)` in `onModuleInit`.

### Step 7: Create unit tests

Create `src/discovery/manifest.service.spec.ts` with the following test cases:

1. `generateManifest` returns correct top-level structure and service info.
2. `scanOnEventDecorators` finds `@OnEvent` decorated methods and builds wildcard subjects.
3. `scanOnRequestReplyDecorators` finds `@OnRequestReply` decorated methods and uses `eventType` as subject.
4. `scanEmitEventDecorators` finds `@EmitEvent` decorated methods and builds template subjects with `{companyId}` placeholder.
5. `extractPayloadSchemaRef` prefers explicit `payloadSchemaRef` over reflection.
6. `extractPayloadSchemaRef` falls back to `design:paramtypes` for consumers.
7. `extractPayloadSchemaRef` uses `design:returntype` for producers when no explicit ref is provided.
8. `extractPayloadSchemaRef` returns empty string for generic wrapper types (`EventEnvelope`, `EventBase`, `Object`).
9. Version defaults to `'1'` when omitted.
10. Description and tags default to empty values when omitted.

Use `@nestjs/testing` `TestingModule` to provide mocked `DiscoveryService`, `Reflector`, and `MetadataScanner`.

### Step 8: Final verification

1. Run `npm run typecheck` — must pass.
2. Run `npm run lint` — zero errors.
3. Run `npm test -- src/discovery/manifest.service.spec.ts` — all tests pass.
4. Run `npm test` — existing suite must still pass.

---

## Acceptance Criteria

- `ManifestService` correctly extracts `payloadSchemaRef` for all three decorator types.
- `npm run lint` reports zero errors.
- Unit tests for `ManifestService` exist and pass.
- No method/function in the reviewed files exceeds 2 parameters.
- No method exceeds 2 levels of block nesting.
- `DiscoveryService` logs the generated manifest on startup when `registerOnStartup` is true.
