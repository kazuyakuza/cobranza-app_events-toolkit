# Simplification Plan — Fix Dependency Error (Commit `12de904`)

## Scope
Review of commit `12de904` changes for unnecessary complexity, redundancy, and readability issues.

## Findings

### 1. `src/producer/producer.constants.ts` — inconsistent type import
- `JetStreamClient` is imported at the top, but `ProducerModuleOptions.connection` uses an inline `import('nats').NatsConnection`.
- This is inconsistent and slightly harder to read. Prefer a top-level `NatsConnection` import.

### 2. `src/producer/producer.module.di.spec.ts` — dead import and duplication
- `JETSTREAM_TOKEN` is imported but never used.
- The `Test.createTestingModule({ imports: [ProducerModule.forRoot({ jetStream: mockJetStream })] }).compile()` call is repeated verbatim in three `forRoot` tests.
- Extract a helper such as `compileProducerModule()` to remove duplication and make intent clearer.

### 3. `src/module-compilation.spec.ts` — heavy duplication across module tests
- The test pattern for `ConsumerModule`, `OutboxModule`, and `DiscoveryModule` is nearly identical:
  - Each has a `forRoot` test asserting `module` and `providers.length > 0`.
  - Each has a `forRootAsync` test with the same two assertions.
- Use a parameterized helper (e.g., `it.each` or a `assertModuleCompiles(module, options)` helper) to collapse the duplication.
- `mockJetStream` is declared at the top level but only used in `ConsumerModule` tests; move it inside the `ConsumerModule` describe block.
- The `jest.mock('./outbox/sqlite-outbox.repository', ...)` is only needed for `OutboxModule`; consider scoping the mock or adding a short comment explaining why it lives at file level.

### 4. `src/events-toolkit.module.spec.ts` — repeated objects and casts
- The options object `{ nats: { connection: { jetstream: () => mockJetStream } as unknown as NatsConnection } }` is repeated in every `forRoot` test.
- The cast `(m as { module?: { name?: string; }; }).module?.name` is repeated many times.
- Extract a constant like `forRootOptions` and a helper like `getModuleName(imported)` to improve readability and reduce noise.

### 5. `src/producer/producer.module.ts` — duplicated return structure in `forRootAsync`
- Both branches of `forRootAsync` return an object with the same `module`, `global`, and `exports` values, plus the same `EventLoggerService`, `ProducerService`, and `EmitEventInterceptor` providers.
- Build a common base providers array and return object to avoid repetition, only conditionally adding the `JETSTREAM_TOKEN` provider.

## Proposed Actions
1. Refactor `producer.constants.ts` to import `NatsConnection` at the top.
2. Remove unused `JETSTREAM_TOKEN` import from `producer.module.di.spec.ts` and extract a `compileProducerModule()` helper.
3. Parameterize `module-compilation.spec.ts` with a helper/table-driven test to remove duplication; scope `mockJetStream` and document/scope the Outbox mock.
4. Extract repeated options object and module-name cast helper in `events-toolkit.module.spec.ts`.
5. Simplify `producer.module.ts` `forRootAsync` by building a shared return object and conditionally appending the JetStream provider.

## Out of Scope
- No functional changes; simplifications must preserve existing test coverage and behavior.
- Do not alter the `@Optional()` decorator addition in `event-logger.service.ts`; it is a functional fix, not a simplification target.
