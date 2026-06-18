# Task 5 Service Information — Code Review Fix Plan

## Issues Found

### 1. `src/discovery/discovery.module.ts` exceeds max nesting depth
- **Severity**: Medium
- **Details**: The static methods `forRoot` and `forRootAsync` define inline provider objects that contain arrow-function factories. This creates a third indentation level inside the method body, violating the project's max-depth rule (2 levels).
- **Files affected**: `src/discovery/discovery.module.ts`

### 2. `src/discovery/package-info-reader.utils.ts` returns a mutable shared fallback
- **Severity**: Low
- **Details**: `UNKNOWN_SERVICE` is a single object literal returned by reference when `package.json` is missing or invalid. A caller could mutate the returned object and corrupt subsequent reads.
- **Files affected**: `src/discovery/package-info-reader.utils.ts`

### 3. `src/discovery/discovery.service.ts` instantiates `EventLoggerService` directly
- **Severity**: Low
- **Details**: The fallback `new EventLoggerService()` bypasses NestJS dependency injection. If `EventLoggerService` ever requires constructor arguments, the fallback will fail at runtime.
- **Files affected**: `src/discovery/discovery.service.ts`

## Fix Steps

### Step 1 — Refactor `discovery.module.ts` to satisfy max-depth rule

1. In `src/discovery/discovery.module.ts`, remove the inline `schemaGeneratorFactory` declarations from `forRoot` and `forRootAsync`.
2. Add a module-level helper function `createSchemaGenerator()` at the top level of the file:
   ```ts
   function createSchemaGenerator(moduleOptions: DiscoveryModuleOptions): SchemaGenerator {
     return new SchemaGenerator({
       schemaDir: moduleOptions.schemaDir,
       forceRegenerate: moduleOptions.forceRegenerateSchemas,
     });
   }
   ```
3. Add a module-level provider factory object:
   ```ts
   const SCHEMA_GENERATOR_PROVIDER = {
     provide: SchemaGenerator,
     useFactory: createSchemaGenerator,
     inject: [DISCOVERY_MODULE_OPTIONS],
   };
   ```
4. Add a module-level helper for async option resolution:
   ```ts
   function createAsyncOptionsResolver(asyncOptions: DiscoveryModuleAsyncOptions) {
     return async (...args: unknown[]): Promise<DiscoveryModuleOptions> => {
       const userOptions = await asyncOptions.useFactory(...args);
       return resolveDiscoveryOptions(userOptions);
     };
   }
   ```
5. Replace the inline provider definitions in `forRoot` and `forRootAsync` with references to `SCHEMA_GENERATOR_PROVIDER` and `createAsyncOptionsResolver`.
6. Ensure `forRoot` and `forRootAsync` method bodies remain at most 2 indentation levels deep.

### Step 2 — Protect the fallback package info object

1. In `src/discovery/package-info-reader.utils.ts`, change the fallback return to a fresh object or freeze the constant:
   ```ts
   const UNKNOWN_SERVICE = Object.freeze({ name: 'unknown', version: '0.0.0' });
   ```
2. Verify all return paths in `readPackageInfo` either return a newly constructed object or the frozen fallback.

### Step 3 — Avoid direct instantiation of `EventLoggerService`

1. In `src/discovery/discovery.service.ts`, remove the fallback `new EventLoggerService()`.
2. If a logger may be absent, guard each log call with `this.logger?.` or use a no-op logger object instead of constructing a real service outside DI.
3. Confirm `DiscoveryService` still compiles and behaves correctly when `EventLoggerService` is not provided.

### Step 4 — Verification

1. Run the TypeScript compiler (`tsc --noEmit`) and confirm no errors.
2. Run the test suite (`npm test`) and confirm existing tests pass.
3. Re-run diagnostics on the modified files and confirm no lint/type issues.
