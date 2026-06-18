# Task 6 Code Review Fix Plan

## Issues Found

### 1. `DiscoveryService` constructor exceeds max arguments rule

- **File**: `src/discovery/discovery.service.ts`
- **Severity**: High
- **Rule**: [Max Arguments per Method Rule](../../.kilo/rules/max-arguments-per-method.md)
- **Description**: The constructor declares three injected dependencies:

  ```typescript
  constructor(
    private readonly manifestService: ManifestService,
    private readonly schemaGenerator: SchemaGenerator,
    private readonly eventPublisher: DiscoveryEventPublisher,
  ) {}
  ```

  This violates the project rule that methods and functions must not have more than two parameters.

## Fix Plan

### Step 1: Refactor `DiscoveryService` constructor

Reduce constructor parameters to one by moving `ManifestService` and `SchemaGenerator` to property injection.

**File**: `src/discovery/discovery.service.ts`

1. Keep `DiscoveryEventPublisher` as the only constructor parameter.
2. Add `@Inject(ManifestService)` and `@Inject(SchemaGenerator)` as class properties.
3. Use definite assignment assertions (`!`) because NestJS injects the properties at runtime.
4. Ensure `Inject` is already imported from `@nestjs/common` (it is).

**Expected change**:

```typescript
@Injectable()
export class DiscoveryService implements OnModuleInit, OnApplicationBootstrap, OnModuleDestroy {
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private cachedManifest: ServiceManifestDto | null = null;

  @Inject(DISCOVERY_MODULE_OPTIONS)
  private readonly resolvedOptions: DiscoveryModuleOptions;

  @Optional()
  @Inject(EventLoggerService)
  private readonly logger: EventLoggerService | undefined;

  @Inject(ManifestService)
  private readonly manifestService!: ManifestService;

  @Inject(SchemaGenerator)
  private readonly schemaGenerator!: SchemaGenerator;

  constructor(private readonly eventPublisher: DiscoveryEventPublisher) {}

  // remaining methods unchanged
}
```

### Step 2: Verify rule compliance after refactor

- File length remains under 200 lines.
- No method body exceeds 50 lines.
- No block nesting exceeds two levels.
- No method has more than two parameters.

### Step 3: Run type check and tests

Execute the project build/type-check and any relevant unit tests to confirm the refactor does not break dependency injection or runtime behavior.

## Minor Observations (Optional)

1. **Silent failure in `DiscoveryEventPublisher.publishOrLog`**: The `catch` block silently discards publish errors. While this meets the "graceful failure" criterion, consider injecting an optional `EventLoggerService` to log failures for observability.
2. **Provider/export duplication in `DiscoveryModule`**: The `providers` and `exported` arrays are duplicated in `forRoot` and `forRootAsync`. Extracting them into constants would improve maintainability but is not a rule violation.

## Approval Criteria

Approve the implementation once the constructor parameter count is reduced to two or fewer and type checking/tests pass.
