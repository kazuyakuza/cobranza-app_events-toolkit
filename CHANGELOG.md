# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [0.11.0] — 2026-07-14

### Added

- **JetStream stream auto-creation** (`consumer.autoCreateStreams`): When enabled, `JetStreamConsumerService.subscribe()` automatically creates a NATS JetStream stream for the subject before subscribing, eliminating the `Error: no stream matches subject` startup failure. Uses `JetStreamManager` to check stream coverage via `streams.find(subject)`; if missing, creates a stream with file storage, limits retention, and unlimited messages/bytes/age. Race conditions (another service creating the same stream simultaneously) are silently handled.
- `StreamAutoCreator` class in `src/consumer/stream-auto-creator.ts`.
- `buildStreamName()` utility in `src/consumer/build-stream-name.util.ts`.
- `consumer.autoCreateStreams?: boolean` option on `EventsToolkitConsumerOptions` (default `false`, opt-in).
- `connection?: NatsConnection` and `autoCreateStreams?: boolean` added to `JetStreamConsumerDeps`.
- Tests: `stream-auto-creator.spec.ts`, `jetstream-consumer.service.auto-create.spec.ts`, `consumer.module.auto-create.spec.ts`.

### Changed

- `ConsumerModuleOptions` now accepts `autoCreateStreams` and propagates it through sync and async provider factories.
- `EventsToolkitModule` passes the resolved `NatsConnection` and `autoCreateStreams` flag to `ConsumerModule`.
- `createSyncJetStreamConsumerDepsProvider` and `createSyncRequestReplyConsumerDepsProvider` refactored to accept single options objects (max-2-params compliance).
- Centralized JetStream resolution: removed duplicate `resolveJetStream` from `consumer.module.ts`.

### Documentation

- New guide: `docs/nats-jetstream-configuration.md` — 11 sections covering NATS server requirements, JetStream configuration, stream auto-creation, manual setup, production recommendations, Docker Compose, resource limits, authentication & security, clustering & replication, monitoring & health checks, backup & restore.
- `README.md` Deployment section trimmed: removed duplicated programmatic stream setup snippet.

## [0.10.7] — 2026-07-14

### Fixed

- **Explorer crash on getter properties that throw during prototype scanning:** The `typeof methodRef === 'function'` guard added in 0.10.5 was incomplete — the expression `target.prototype[methodName]` invokes accessors **before** the guard runs. When `Object.getOwnPropertyNames(prototype)` includes accessor properties such as `HttpAdapterHost.prototype.listen$` (which reads `this._listen$.asObservable()` where `this._listen$` is `undefined` on the prototype), accessing the property throws `TypeError: Cannot read properties of undefined (reading 'asObservable')`. Both `OnEventExplorer` and `OnRequestReplyExplorer` now use `Object.getOwnPropertyDescriptor(target.prototype, methodName)` to inspect properties **without invoking accessors**, and only process entries whose descriptor `value` is a function (data properties only). Accessor properties are skipped entirely, never invoked.
- Removed the `limitDiscoveryToHandlerProvider` workaround from the runtime e2e regression test, so the explorers now scan all providers (including internal NestJS providers with accessor properties) and confirm the fix holds in the real `DiscoveryService` iteration path.

### Changed

- Explorers now bind the handler via the descriptor's `value` (`methodRef.bind(target.instance)`) instead of re-accessing `target.instance[methodName]`, eliminating a redundant property lookup and avoiding any accidental accessor invocation.

## [0.10.5] — 2026-07-14

### Fixed

- **JetStream consumer options defaulting to invalid `{}`**: `JetStreamConsumerService.subscribe()` and `RequestReplyConsumerService.subscribe()` previously passed `{}` to `jetStream.subscribe()` when `consumerOpts` was omitted, causing `TypeError: Cannot read properties of undefined (reading 'ack_policy')` in NATS `JetStreamClientImpl._processOptions`. Both services now use `resolveConsumerSubscribeOpts()` which defaults to `consumerOpts().manualAck().ackExplicit()`, guaranteeing `config.ack_policy` is always set.
- **Explorer metadata reflection crash on accessor properties**: `OnEventExplorer` and `OnRequestReplyExplorer` iterated over all `Object.getOwnPropertyNames(prototype)` including getter/setter accessors. For accessor properties, `prototype[methodName]` returns `undefined`, causing `Reflect.getMetadata` to throw `TypeError`. Added `typeof methodRef === 'function'` guard in both explorers before calling `reflector.get()`.

### Added

- End-to-end runtime regression test (`src/events-toolkit.runtime.e2e-spec.ts`) that boots `EventsToolkitModule.forRootAsync` through the full NestJS lifecycle (`moduleRef.init()`), registering a provider with `@OnEvent`, `@OnRequestReply`, and getter/setter accessor properties. Guards both the explorer metadata reflection bug and the empty-consumer-options bug from regressing.

### Changed

- Enriched the `jest.mock('nats', ...)` factory in the existing DI compilation e2e spec (`src/events-toolkit.module.e2e-spec.ts`) to export `AckPolicy` and `consumerOpts`, ensuring compatibility with the new default consumer options helper.

## [0.10.4]

### Fixed

- **`RequestReplyService` never registered as a provider (Bug 3)**: `RequestReplyService` (and its dependency token `REQUEST_REPLY_DEPS_TOKEN`) had `@Injectable()` decoration but were never added to any module's `providers` or `exports` arrays. Consumers injecting `RequestReplyService` (e.g. `CrudHandlersModule`) failed at DI compilation with `Nest can't resolve dependencies of the RequestReplyService (RequestReplyService, ?)`. Both `EventsToolkitModule.forRoot` and `EventsToolkitModule.forRootAsync` now register and export `RequestReplyService` and `REQUEST_REPLY_DEPS_TOKEN`.

### Changed

- **Single NATS connection in the async path**: introduced an internal `RESOLVED_NATS_TOKEN` that resolves the NATS connection exactly once. `JETSTREAM_TOKEN` and the new `NATS_CONNECTION_TOKEN` are now thin derived providers over the single resolved connection, preventing duplicate NATS connections when both JetStream and request-reply are active.
- Extracted all EventsToolkitModule provider factories into `src/events-toolkit-module.providers.ts` to keep `events-toolkit.module.ts` under the 200-line file limit and method bodies under 50 lines.

### Added

- Optional `requestReply?: Partial<RequestReplyConfig>` field on `EventsToolkitModuleOptions` to override `defaultTimeoutMs` (default: 5000ms).

## [0.10.3]

### Fixed

- **`DiscoveryModule` missing `NestDiscoveryModule` import**: `ManifestServiceDepsProvider` depends on `MetadataScanner`, `DiscoveryService`, and `Reflector` from `@nestjs/core`, but `DiscoveryModule` did not import `NestDiscoveryModule`, causing NestJS DI resolution errors at runtime. Added `NestDiscoveryModule` to the `imports` array in `buildDiscoveryDynamicModule`.

### Added

- End-to-end DI compilation test (`src/events-toolkit.module.e2e-spec.ts`) that compiles the full `EventsToolkitModule.forRootAsync` graph with mocked NATS and SQLite outbox, resolving all core services (`ProducerService`, `ConsumerService`, `OutboxService`, `DiscoveryService`) to catch DI regressions across the entire module boundary.

### Changed

- CI workflow updated to run e2e spec files alongside unit tests.

## [0.10.2] — 2026-07-13

### Fixed

- **`EventsToolkitModule.forRootAsync` missing exports**: The dynamic module returned by `forRootAsync` did not include an `exports` array, so the async providers (`EVENTS_TOOLKIT_OPTIONS`, `JETSTREAM_TOKEN`, `EventLoggerService`) were invisible to the imported sub-modules (`ProducerModule`, `ConsumerModule`, `OutboxModule`, `DiscoveryModule`). This caused NestJS DI resolution errors in any consumer using the async registration path (e.g., `ms-db-gateway` via `NatsModule`). The `forRoot` synchronous path was unaffected because it passes resolved values directly into sub-modules.

### Added

- DI compilation regression test in `src/events-toolkit.module.di.spec.ts` that compiles `EventsToolkitModule.forRootAsync` through NestJS `Test.createTestingModule` and resolves `ProducerService` via DI, preventing this class of missing-export regression.

## [0.10.1] — 2026-07-12

### Fixed

- **Circular dependency in `ProducerModule`**: `EmitEventInterceptor` had an undefined dependency at runtime (`Nest can't resolve dependencies of the EmitEventInterceptor (Reflector, ?)`) caused by a circular import chain: `producer.module.ts` → `emit-event-interceptor.ts` → `producer.service.ts` → `producer.module.ts`. At decoration time, `ProducerService` was `undefined` due to the circular `require()`, so NestJS stamped `design:paramtypes[1]` as `undefined`.

### Changed

- Extracted `JETSTREAM_TOKEN`, `ProducerModuleOptions`, and `ProducerModuleAsyncOptions` from `producer.module.ts` into a new leaf file `src/producer/producer.constants.ts`. This breaks the circular dependency because `producer.service.ts` no longer imports from `producer.module.ts`. All import sites updated accordingly.

### Added

- DI compilation regression tests: `src/producer/producer.module.di.spec.ts` compiles `ProducerModule` through NestJS `Test.createTestingModule` and resolves `EmitEventInterceptor` via DI, ensuring the circular dependency does not reappear. `src/module-compilation.spec.ts` validates that the root `EventsToolkitModule` compiles cleanly.

## [0.10.0] — 2026-07-05

### Breaking

- **Testing utilities** (`EventsToolkitTestModule`, `Mock*Service`, `expect*` helpers, `PublishedEvent`, `SavedOutboxEvent`) are no longer exported from the main entry. Import them from `@cobranza-apps/events-toolkit/testing` instead. This prevents `@jest/globals` from being loaded when consumers import the main entry outside a Jest environment.

## [0.9.0] - 2026-07-03

### Added

- `ManifestContributor` interface in `src/discovery/manifest-contributor.interface.ts` — extension point for services with dynamically registered event handlers.
- `DiscoveryService.registerContributor(contributor)` — registers a `ManifestContributor` to be called during manifest generation.
- `ManifestContributorMerger` in `src/discovery/manifest-contributor.merger.ts` — merges contributor entries into the baseline manifest with deduplication.
- Contributor entries participate in schema generation and are included in the `platform.service.register.v1` event.
- Deduplication: baseline (decorator-scanned) entries take priority over contributor entries by `subject` (produces) and `subject|type` (consumes).
- `MockDiscoveryService` updated to support `registerContributor()` with identical merge semantics.
- New tests: `manifest-contributor.merger.base.spec.ts`, `manifest-contributor.merger.dedup.spec.ts`, and `discovery.service.spec.ts`.
- New example: `docs/examples/manifest-contributor.example.ts`.
- Documentation: `event-discovery-and-service-registry.md` updated with ManifestContributor usage, lifecycle ordering, deduplication behavior, and migration from manual patching.

## [0.8.0] - 2026-06-29

### Changed

- **Breaking:** Decorator option interfaces (`EmitEventOptions`, `OnEventOptions`, `OnRequestReplyOptions`) now require the following fields to be provided explicitly:
  - `version: string` — required on `@EmitEvent` and `@OnEvent` (not applicable to `@OnRequestReply`, which has no `version` field).
  - `description: string` — required on all three decorators.
  - `payloadExample: Record<string, unknown>` — required on all three decorators.
- The second argument to `@EmitEvent()`, `@OnEvent()`, and `@OnRequestReply()` is now **required** (previously optional). Omitting it is now a compile-time error.
- The corresponding `*Metadata` interfaces (`EmitEventMetadata`, `OnEventMetadata`, `OnRequestReplyMetadata`) mirror the same required fields, guaranteeing type safety for downstream consumers of the stored metadata.

### Removed

- `ManifestEntryBuilder` no longer falls back to `'1'` for `version` or `''` for `description` when building manifest entries (`??` operators removed). These fields are now guaranteed present by the type system.
- Dead `?? '1'` fallbacks removed from `EmitEventInterceptor.buildSubject()` and `OnEventExplorer.buildWildcardSubject()` — same rationale.

### Added

- `ManifestEntryBuilder` now has dedicated test coverage in `src/discovery/manifest-entry.builder.spec.ts`. Tests verify each builder method (`buildOnEventEntry`, `buildOnRequestReplyEntry`, `buildEmitEventEntry`) produces correctly shaped entries, that `description`/`payloadExample` propagate without fallbacks, that `tags ?? []` fallback still works, and that `payloadSchemaRef` auto-resolution from TypeScript reflect metadata works for both param types (consumers) and return types (producers).

### Migration

- **All decorator usages must be updated** to pass the now-required fields. For each `@EmitEvent` / `@OnEvent` call, add `version`, `description`, and `payloadExample`. For each `@OnRequestReply` call, add `description` and `payloadExample`.
- Example migration:

  ```diff
  - @EmitEvent('payment.proof.uploaded', { version: '1' })
  + @EmitEvent('payment.proof.uploaded', {
  +   version: '1',
  +   description: 'Proof was uploaded',
  +   payloadExample: { proofId: 'uuid', amount: 100 },
  + })
  ```

- `tags` remains optional (`?? []` fallback preserved in `ManifestEntryBuilder`); no change needed for existing `tags` usage.
- `payloadSchemaRef` remains optional (auto-resolved from reflect metadata); no change needed for existing `payloadSchemaRef` usage.
- `companyId` on `@OnRequestReply` remains optional; no change needed.

### Documentation

- Updated `docs/event-messaging-convention.md` Section 4.1 options table to mark `version`, `description`, and `payloadExample` as required.
- Updated `docs/event-discovery-and-service-registry.md` decorator annotation examples to include the now-required fields.
- Added **README Quickstart** section with literal step-by-step checklist for AI agents.
- Added **README Onboarding Flow** section with 11-step navigation covering architecture → deploy.
- Added **README Deployment** section with JetStream stream config, env vars table, and health checks.
- Fixed stale decorator signatures (added required `description`, `payloadExample`) across all `.md` docs and `.ts` examples.
- Fixed old object-based decorator patterns (`{ domain, entity, action }`) in `docs/examples/async-request-reply.example.ts` and `.agent/project-info/tech.md`.
- Added onboarding-flow step pointers to all relevant `docs/*.md` files.
- Added missing cross-links between related documentation files (ai-agent-guidelines, outbox-*, testing-utilities, request-reply-*).
- Refreshed `.agent/project-info/architecture.md` (component tree + entry points), `brief.md` (folder structure + modules), `tech.md` (version + signatures), and `CONTEXT.md` (focus + history).
- Swept JSDoc/TSDoc gaps across all exported `src/` symbols.

## [0.7.4] - 2026-06-27

### Fixed

- Fixed a NestJS 11 module compilation failure in `EventsToolkitModule.forRoot()` and `EventsToolkitModule.forRootAsync()`. The module previously declared an `exports` array containing `ProducerService`, `ConsumerService`, `OutboxService`, `EventLoggerService`, and `DiscoveryService`, but only `EventLoggerService` was declared in the module's own `providers` array. The remaining tokens belong to the imported sub-modules (`ProducerModule`, `ConsumerModule`, `OutboxModule`, `DiscoveryModule`).
- NestJS 11 introduced stricter provider-export validation (`Module.validateExportedProvider`), which rejects exporting a token that is neither declared in the module's own `providers` nor directly re-exported from an `imports` entry. This caused production startup (`nest start`) and test compilation (`Test.createTestingModule`) to fail with: `Nest cannot export a provider/module that is not a part of the currently processed module (EventsToolkitModule)`.
- Removed the redundant `exports` arrays from both `forRoot()` and `forRootAsync()`. Because `ProducerModule`, `ConsumerModule`, `OutboxModule`, and `DiscoveryModule` are all registered with `global: true` (and `EventsToolkitModule` itself is `global: true`), their providers remain available application-wide through the global DI registry. The `exports` array was both invalid and functionally redundant.

### Upgrade Notes

- **No code changes are required for consumers.** Continue to inject `ProducerService`, `ConsumerService`, `OutboxService`, `EventLoggerService`, and `DiscoveryService` via constructor dependency injection as before.
- Services remain available application-wide; nothing in the public API or consumption pattern changed.
- If you depend on `EventsToolkitModule` explicitly re-exporting those services (non-standard), switch to injecting them directly — they are globally available.
