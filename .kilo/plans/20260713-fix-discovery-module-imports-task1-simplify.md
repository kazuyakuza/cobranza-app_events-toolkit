# Simplification Plan — Task 1: Fix DiscoveryModule imports

## Scope

Review the implementation changes made to `src/discovery/discovery.module.ts` in Step 4.2.
Preserve the runtime behavior (both `forRoot` and `forRootAsync` must still import `NestDiscoveryModule` from `@nestjs/core`) while improving maintainability and reducing duplication.

## Findings

`src/discovery/discovery.module.ts` is **131 lines**, below the project rule of **200 lines per source file**.  
However, `forRoot` and `forRootAsync` duplicate the `DynamicModule` return structure (`module`, `global`, `exports`, `controllers`), the shared provider list, and the shared exports list.  
`createAsyncOptionsResolver` also carries an explicit return type that can be inferred.

## Simplifications

### 1. Extract shared core providers constant

Introduce a `CORE_DISCOVERY_PROVIDERS` array containing the providers that are identical in both `forRoot` and `forRootAsync`:

```ts
const CORE_DISCOVERY_PROVIDERS: Provider[] = [
  DiscoveryService,
  ManifestService,
  MANIFEST_DEPS_FACTORY,
  SCHEMA_GENERATOR_PROVIDER,
  DiscoveryEventPublisher,
];
```

Update both methods to spread this constant instead of repeating the array:

```ts
const providers = [
  { provide: DISCOVERY_MODULE_OPTIONS, useValue: resolvedOptions },
  ...CORE_DISCOVERY_PROVIDERS,
];
```

### 2. Extract shared exports constant

Introduce a `DISCOVERY_EXPORTS` array for the repeated `exports` value:

```ts
const DISCOVERY_EXPORTS: (Type<unknown> | typeof SchemaGenerator | typeof DiscoveryEventPublisher)[] = [
  DiscoveryService,
  ManifestService,
  SchemaGenerator,
  DiscoveryEventPublisher,
];
```

Replace the inline `exported` arrays in both methods with this constant.

### 3. Add a helper to build the base `DynamicModule`

Create a small helper that owns the duplicated `DynamicModule` fields and always prepends `NestDiscoveryModule` to `imports`:

```ts
function buildDiscoveryDynamicModule(
  providers: Provider[],
  extraImports: Array<Type<unknown> | DynamicModule | Promise<DynamicModule>> = [],
): DynamicModule {
  return {
    module: DiscoveryModule,
    global: true,
    imports: [NestDiscoveryModule, ...extraImports],
    providers,
    exports: DISCOVERY_EXPORTS,
    controllers: [DiscoveryController],
  };
}
```

Update `forRoot`:

```ts
static forRoot(options: EventsToolkitDiscoveryOptions): DynamicModule {
  const resolvedOptions = resolveDiscoveryOptions(options);
  return buildDiscoveryDynamicModule([
    { provide: DISCOVERY_MODULE_OPTIONS, useValue: resolvedOptions },
    ...CORE_DISCOVERY_PROVIDERS,
  ]);
}
```

Update `forRootAsync`:

```ts
static forRootAsync(asyncOptions: DiscoveryModuleAsyncOptions): DynamicModule {
  return buildDiscoveryDynamicModule(
    [
      {
        provide: DISCOVERY_MODULE_OPTIONS,
        useFactory: createAsyncOptionsResolver(asyncOptions),
        inject: asyncOptions.inject ?? [],
      },
      ...CORE_DISCOVERY_PROVIDERS,
    ],
    asyncOptions.imports ?? [],
  );
}
```

### 4. Simplify `createAsyncOptionsResolver`

Remove the redundant explicit return type and inline the `await`/`return` expression:

```ts
function createAsyncOptionsResolver(asyncOptions: DiscoveryModuleAsyncOptions) {
  return async (...args: unknown[]) => resolveDiscoveryOptions(await asyncOptions.useFactory(...args));
}
```

The inferred return type is `(...args: unknown[]) => Promise<DiscoveryModuleOptions>`, which matches the previous explicit annotation.

### 5. Import `Provider` from `@nestjs/common`

Because `buildDiscoveryDynamicModule` uses `Provider[]`, add `Provider` to the existing import:

```ts
import { DynamicModule, Module, Provider, Type } from '@nestjs/common';
```

## Expected Result

- `forRoot` and `forRootAsync` no longer duplicate `module`, `global`, `exports`, `controllers`, or the shared provider list.
- `NestDiscoveryModule` is always present in `imports` through a single code path.
- The file remains under 200 lines and ideally under 150 lines.
- No behavior change for consumers.

## Verification

After applying the simplifications:

1. `npm run lint` must pass with no new warnings.
2. `npm test -- discovery` must pass.
3. File line count must comply with `.kilo/rules/max-lines-per-file.md` (`src/discovery/discovery.module.ts` ≤ 200 lines).
4. Method bodies must remain ≤ 50 lines and nesting depth ≤ 2 levels per `.kilo/rules/max-lines-per-method.md` and `.kilo/rules/max-depth.md`.
5. No behavior change: both `DiscoveryModule.forRoot` and `DiscoveryModule.forRootAsync` must still import `NestDiscoveryModule` and export the same providers.

## Out of Scope

- Do not remove or alter the `NestDiscoveryModule` import fix.
- Do not change the public API of `DiscoveryModule.forRoot` or `DiscoveryModule.forRootAsync`.
- Do not modify other discovery files (`discovery.service.ts`, `manifest.service.ts`, etc.).
