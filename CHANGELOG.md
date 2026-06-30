# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).

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
