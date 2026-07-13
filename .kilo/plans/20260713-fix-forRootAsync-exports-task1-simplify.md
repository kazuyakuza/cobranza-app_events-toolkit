# Simplification Plan — Task 1: Fix library exports

## Scope

Review the implementation changes made to `EventsToolkitModule.forRootAsync` and its tests in Step 4.2.
Preserve the runtime behavior (exports must still expose `EVENTS_TOOLKIT_OPTIONS`, `JETSTREAM_TOKEN`, and `EventLoggerService`) while improving maintainability and rule compliance.

## Findings

`src/events-toolkit.module.ts` is **223 lines**, exceeding the project rule of **200 lines per source file**.  
`src/events-toolkit.module.spec.ts` is **205 lines**, also above the limit.  
Both files contain duplicated setup code and repeated assertions that can be extracted into helpers.

## Simplifications

### 1. Extract provider builders into a dedicated file

Move the following helper functions out of `src/events-toolkit.module.ts` into a new `src/events-toolkit.providers.ts`:

- `buildLoggingProvider`
- `buildAsyncOptionsProvider`
- `buildAsyncJetStreamProvider`
- `buildAsyncLoggingProvider`
- `buildConsumerAsyncImport`
- `buildOutboxAsyncImport`
- `buildDiscoveryAsyncImport`

Keep the following in the module file because they are shared between `forRoot` and the async builders:

- `resolveConnection`
- `buildOutboxModuleOptions`
- `EVENTS_TOOLKIT_OPTIONS` constant
- `EventsToolkitModule` class

Expected result: `events-toolkit.module.ts` drops below 150 lines and each file has a single responsibility.

### 2. Remove duplicated `EventLoggerService` options construction

Introduce a small helper used by both sync and async logging providers:

```ts
function buildLoggerOptions(logging?: EventsToolkitLoggingOptions): EventLoggerOptions {
  return logging ? { level: logging.level, transports: logging.transports } : {};
}
```

Both `buildLoggingProvider` and `buildAsyncLoggingProvider` should delegate to this helper instead of duplicating the `{ level, transports }` mapping.

### 3. Simplify `buildOutboxModuleOptions`

Replace the explicit field-by-field mapping with object spread for the `postgres` branch:

```ts
function buildOutboxModuleOptions(outbox: EventsToolkitOutboxOptions): OutboxModuleOptions {
  if (outbox.type === 'postgres') {
    return { ...outbox };
  }
  return {
    type: 'sqlite',
    sqlite: { dbPath: outbox.sqlitePath ?? ':memory:' },
    serviceOptions: outbox.serviceOptions,
  };
}
```

### 4. Extract shared test helpers and mocks

Create a test-helpers module (e.g. `src/test-utils/events-toolkit-test-helpers.ts`) containing:

- Shared `mockJetStream` value.
- Shared `forRootOptions` and `forRootAsyncOptions` factories.
- `findProvider(provider[], token)` helper and the `Provider` type currently duplicated in `events-toolkit.module.spec.ts`.
- `getModuleName(imported)` helper.

Move the identical `jest.mock('nats')` and `jest.mock('./outbox/sqlite-outbox.repository')` blocks into mock modules under `src/test-utils/mocks/` and import them at the top of each spec. Jest hoists `jest.mock` calls from imported modules, so this removes the duplicated mock definitions while keeping them active.

### 5. Reduce repetition in `events-toolkit.module.spec.ts`

- Add a `buildForRootModule()` and `buildForRootAsyncModule()` helper so tests stop repeating `await EventsToolkitModule.forRoot(forRootOptions)` and `EventsToolkitModule.forRootAsync(forRootAsyncOptions)`.
- Add an assertion helper such as `expectImportsToContain(module, [...names])` to collapse repeated `expect(importNames).toContain(...)` blocks.
- Remove the redundant test `should include ProducerModule, ConsumerModule, and OutboxModule in imports`; the same assertion is already covered by the earlier `should import sub-modules globally and export toolkit-level tokens` test.

### 6. Simplify DI spec global mock module

In `src/events-toolkit.module.di.spec.ts`, consider replacing the inline `GlobalCoreModule` class with a small helper function that returns the mock providers array, or move the class to the same test-utils file. This keeps the DI spec focused on the export regression being tested.

## Verification

After applying the simplifications:

1. `npm run lint` or `eslint` must pass with no new warnings.
2. `npm test -- events-toolkit.module` must pass, including the new DI compilation spec.
3. File line counts must comply with `.kilo/rules/max-lines-per-file.md`:
   - `src/events-toolkit.module.ts` ≤ 200 lines.
   - `src/events-toolkit.module.spec.ts` ≤ 200 lines.
4. Method bodies must remain ≤ 50 lines and nesting depth ≤ 2 levels per `.kilo/rules/max-lines-per-method.md` and `.kilo/rules/max-depth.md`.
5. No behavior change: `EventsToolkitModule.forRootAsync` must still export `EVENTS_TOOLKIT_OPTIONS`, `JETSTREAM_TOKEN`, and `EventLoggerService`.

## Out of Scope

- Do not change the public API of `EventsToolkitModule.forRootAsync`.
- Do not modify `ProducerModule`, `ConsumerModule`, `OutboxModule`, or `DiscoveryModule` internals.
- Do not remove or weaken the export regression tests; only refactor their setup.
