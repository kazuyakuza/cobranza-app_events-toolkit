# Global Plan: Event Discovery Module

**TODO File**: `.agent/todos/20260617/20260617-todo-0.md`
**Date**: 2026-06-17
**Branch**: `feat/event-discovery-module`
**Project**: `@cobranza-apps/events-toolkit`

---

## Global Overview

Implement a robust Event Discovery system that automatically generates service manifests (including payload schema references), auto-generates JSON Schemas from DTO classes, and exposes discovery endpoints. The system emits registration and heartbeat events on the `platform.*` subject namespace.

**Key Technical Decisions**:
- Use `class-validator-jsonschema` for schema auto-generation.
- Persist generated manifests and schemas to the filesystem (not in-memory cache).
- Backward compatibility is not a concern (no consumers of this library yet).
- All source files must comply with project rules: max 200 lines, max 50 lines per method, max 2 indentation levels, max 2 method params.

---

## Global Pre-Analysis

### Current State
- `EventsToolkitModule.forRoot()` accepts `nats`, `outbox`, `logging`, and `consumer` options. No `discovery` config exists.
- Decorators `@OnEvent`, `@EmitEvent`, and `@OnRequestReply` store minimal metadata (`domain`, `entity`, `action`, `version` or `eventType`). No rich metadata (description, tags, payloadExample) is supported.
- `EventsToolkitTestModule` provides mocks for Producer, Consumer, Outbox, Logger, and RequestReply. No mocks for Discovery or Manifest services.
- `class-validator-jsonschema` is **not** installed.
- Docs exist for event conventions, request-reply, outbox, and testing, but nothing for discovery.
- `package.json` is at version `0.5.0`.

### Dependencies to Add
- `class-validator-jsonschema` (and its peer `class-transformer` if not already present).

### Files to Create (summary)
- `src/discovery/discovery.module.ts`
- `src/discovery/discovery.service.ts`
- `src/discovery/discovery.controller.ts`
- `src/discovery/manifest.service.ts`
- `src/discovery/dto/service-manifest.dto.ts`
- `src/discovery/utils/schema-generator.ts`
- `src/discovery/utils/file-persister.ts` (optional helper for file persistence)
- `src/testing/mock-manifest.service.ts`
- `src/testing/mock-discovery.service.ts`

### Files to Modify (summary)
- `src/events-toolkit-options.interface.ts` — add `discovery` options.
- `src/events-toolkit.module.ts` — conditionally import `DiscoveryModule`.
- `src/consumer/decorators/on-event.decorator.ts` — extend `OnEventOptions`.
- `src/producer/decorators/emit-event.decorator.ts` — extend `EmitEventOptions`.
- `src/consumer/decorators/on-request-reply.decorator.ts` — extend `OnRequestReplyOptions`.
- `src/testing/events-toolkit-test.module.ts` — add Discovery mocks.
- `package.json` — add dependency, bump version.
- `docs/event-messaging-convention.md` — add `platform.*` subjects.
- `README.md` — link new doc.
- New doc: `docs/event-discovery-and-service-registry.md`.

---

## Step 2: Git Feature Branch Setup

**Sub-agent**: `implementer`
**Scope**: Prepare repository for development.

1. Run `git status`. Commit any unstaged changes with meaningful messages (follow Gitignore Compliance Rule).
2. Ensure current branch is `main`. If not, ask user to merge or checkout.
3. Create and switch to branch: `feat/event-discovery-module`.

---

## Step 3: Version Update

**Sub-agent**: `implementer`
**Scope**: Bump package version.

1. Increment version in `package.json` from `0.5.0` to `0.6.0` (minor bump for new feature).
2. Update `LIBRARY_VERSION` constant in `src/common/constants.ts` to `0.6.0`.
3. Commit with message: `chore: bump version to 0.6.0`.

---

## Task 1: Discovery Module Setup

### Pre-Analysis
- Need a new `DiscoveryModule` that can be conditionally imported by `EventsToolkitModule`.
- Need `DiscoveryService` to hold runtime manifest/sc state.
- Need to extend `EventsToolkitModuleOptions` with a `discovery` object containing `enabled`, `registerOnStartup`, `heartbeatIntervalMinutes`, and `includeFullManifestInHeartbeat`.

### 4.1 Analysis & Planning
**Sub-agent**: `architect`
- Design `DiscoveryModule` as a NestJS dynamic module.
- Design `DiscoveryService` with `OnApplicationBootstrap` / `OnModuleDestroy` hooks.
- Define `EventsToolkitDiscoveryOptions` interface.
- Save detailed plan to `.kilo/plans/20260617-task1-discovery-module-setup.md`.

### 4.2 Implementation
**Sub-agent**: `implementer`
- Create `src/discovery/discovery.module.ts`.
- Create `src/discovery/discovery.service.ts`.
- Update `src/events-toolkit-options.interface.ts` with `discovery?: EventsToolkitDiscoveryOptions`.
- Update `src/events-toolkit.module.ts` to conditionally import `DiscoveryModule` when `discovery?.enabled !== false`.
- Commit changes.

### 4.3 Code Review
**Sub-agent**: `code-reviewer`
- Review for rule compliance (lines, indentation, params).
- Verify `DiscoveryModule` is properly registered in `EventsToolkitModule`.

### 4.4 Documentation
**Sub-agent**: `docs-specialist`
- Add inline JSDoc for new options and service methods.

### 4.5 Verification
**Sub-agent**: `architect`
- Verify implementation matches plan and integrates cleanly with existing module structure.

### 4.6 Task Completion
**Sub-agent**: `implementer`
- Append `[DONE]` to Task 1 in TODO file.
- Commit.

---

## Task 2: Service Manifest & Schema References

### Pre-Analysis
- Need a `ServiceManifestDto` that describes the service: `name`, `version`, `description`, `instanceId`, `consumes[]`, `produces[]`.
- Each entry in `consumes[]` / `produces[]` must include `payloadSchemaRef`, `description`, `version`, `handler`, `tags`.
- Need `ManifestService` that uses NestJS `MetadataScanner` / `Reflector` to scan providers/controllers for `@OnEvent`, `@EmitEvent`, and `@OnRequestReply` metadata.
- Must extract `payloadSchemaRef` from the event class (DTO) used as the method parameter type.

### 4.1 Analysis & Planning
**Sub-agent**: `architect`
- Design `ServiceManifestDto` and nested DTOs (`EventManifestEntryDto`).
- Design `ManifestService` scanning strategy (use `DiscoveryService` from `@nestjs/core` to get controllers/providers, then scan methods).
- Determine how to infer `payloadSchemaRef` from method parameter types (TypeScript reflection / `design:paramtypes`).
- Save plan to `.kilo/plans/20260617-task2-service-manifest.md`.

### 4.2 Implementation
**Sub-agent**: `implementer`
- Create `src/discovery/dto/service-manifest.dto.ts`.
- Create `src/discovery/manifest.service.ts`.
- Wire `ManifestService` into `DiscoveryModule`.
- Commit.

### 4.3 Code Review
**Sub-agent**: `code-reviewer`
- Review DTOs and manifest generation logic.
- Ensure `payloadSchemaRef` is correctly populated.

### 4.4 Documentation
**Sub-agent**: `docs-specialist`
- Document `ServiceManifestDto` structure and `ManifestService` usage.

### 4.5 Verification
**Sub-agent**: `architect`
- Verify manifest generation works with decorated handlers.

### 4.6 Task Completion
**Sub-agent**: `implementer`
- Append `[DONE]` to Task 2 in TODO file.
- Commit.

---

## Task 3: Auto-generation of JSON Schemas from DTOs

### Pre-Analysis
- User explicitly requested `class-validator-jsonschema` library.
- Schemas must be persisted to files, not kept in-memory.
- Must support one or more `examples` per schema (via decorator or static property).
- Must cache generated schemas to avoid regeneration on every call.
- File persistence implies a utility that writes to e.g. `.events-toolkit/schemas/` or a configurable path.

### 4.1 Analysis & Planning
**Sub-agent**: `architect`
- Research `class-validator-jsonschema` API (`validationMetadatasToSchemas`).
- Design `SchemaGenerator` utility.
- Design file persistence strategy (path, filename format, JSON structure).
- Design caching strategy (check mtime or hash of DTO class).
- Save plan to `.kilo/plans/20260617-task3-schema-generation.md`.

### 4.2 Implementation
**Sub-agent**: `implementer`
- Add `class-validator-jsonschema` to `dependencies` in `package.json`.
- Create `src/discovery/utils/schema-generator.ts`.
- Implement logic to generate JSON Schema from decorated classes.
- Implement file persistence helper.
- Integrate with `ManifestService` to trigger generation.
- Commit.

### 4.3 Code Review
**Sub-agent**: `code-reviewer`
- Review schema generation correctness and file I/O safety.

### 4.4 Documentation
**Sub-agent**: `docs-specialist`
- Document schema generation utility and file persistence.

### 4.5 Verification
**Sub-agent**: `architect`
- Verify schemas are correctly generated and written to disk.

### 4.6 Task Completion
**Sub-agent**: `implementer`
- Append `[DONE]` to Task 3 in TODO file.
- Commit.

---

## Task 4: Enhance Existing Decorators

### Pre-Analysis
- `@OnEvent`, `@EmitEvent`, and `@OnRequestReply` need to accept additional optional metadata: `description`, `tags`, `payloadExample`.
- Metadata keys (`ON_EVENT_METADATA`, `EMIT_EVENT_METADATA`, `ON_REQUEST_REPLY_METADATA`) will store the extended options.
- `ManifestService` must read these new fields.

### 4.1 Analysis & Planning
**Sub-agent**: `architect`
- Design extended options interfaces for each decorator.
- Ensure backward compatibility (existing decorators without new fields must still work).
- Save plan to `.kilo/plans/20260617-task4-enhance-decorators.md`.

### 4.2 Implementation
**Sub-agent**: `implementer`
- Update `OnEventOptions` in `src/consumer/decorators/on-event.decorator.ts`.
- Update `EmitEventOptions` in `src/producer/decorators/emit-event.decorator.ts`.
- Update `OnRequestReplyOptions` in `src/consumer/decorators/on-request-reply.decorator.ts`.
- Update `ManifestService` to read the new metadata fields.
- Commit.

### 4.3 Code Review
**Sub-agent**: `code-reviewer`
- Review decorator changes for compatibility and completeness.

### 4.4 Documentation
**Sub-agent**: `docs-specialist`
- Update decorator doc comments with new options.
- Add examples in new discovery doc (Task 9).

### 4.5 Verification
**Sub-agent**: `architect`
- Verify decorators compile and metadata is accessible via `Reflector`.

### 4.6 Task Completion
**Sub-agent**: `implementer`
- Append `[DONE]` to Task 4 in TODO file.
- Commit.

---

## Task 5: Service Information

### Pre-Analysis
- Need to read `name`, `version`, `description` from `package.json`.
- Need to generate a unique `instanceId` (e.g., UUID v4).
- Allow overrides via `EventsToolkitDiscoveryOptions`.
- `DiscoveryService` should hold this info.

### 4.1 Analysis & Planning
**Sub-agent**: `architect`
- Design service info resolution logic (read `package.json` relative to `process.cwd()` or use `require` on root `package.json`).
- Design override interface.
- Save plan to `.kilo/plans/20260617-task5-service-information.md`.

### 4.2 Implementation
**Sub-agent**: `implementer`
- Add service info resolution to `DiscoveryService` or a dedicated helper.
- Update `EventsToolkitDiscoveryOptions` with override fields.
- Generate `instanceId` on module initialization.
- Commit.

### 4.3 Code Review
**Sub-agent**: `code-reviewer`
- Review file reading logic and UUID generation.

### 4.4 Documentation
**Sub-agent**: `docs-specialist`
- Document service info defaults and overrides.

### 4.5 Verification
**Sub-agent**: `architect`
- Verify `package.json` values are correctly read and overridable.

### 4.6 Task Completion
**Sub-agent**: `implementer`
- Append `[DONE]` to Task 5 in TODO file.
- Commit.

---

## Task 6: Automatic Registration Events

### Pre-Analysis
- On `OnApplicationBootstrap`: emit `platform.service.register.v1` with full manifest.
- On shutdown (`OnModuleDestroy`): emit lightweight shutdown event (`platform.service.shutdown.v1`).
- Heartbeat: if `heartbeatIntervalMinutes > 0`, emit `platform.service.heartbeat.v1` periodically.
- Full manifest in heartbeat only if `includeFullManifestInHeartbeat` is `true`.
- Requires `ProducerService` to publish these events.

### 4.1 Analysis & Planning
**Sub-agent**: `architect`
- Design lifecycle integration in `DiscoveryService`.
- Design heartbeat interval management (setInterval / clearInterval).
- Design event payload structures for register, shutdown, and heartbeat.
- Save plan to `.kilo/plans/20260617-task6-registration-events.md`.

### 4.2 Implementation
**Sub-agent**: `implementer`
- Implement `OnApplicationBootstrap` in `DiscoveryService` to emit registration event.
- Implement `OnModuleDestroy` to emit shutdown and clear heartbeat interval.
- Implement heartbeat interval logic.
- Commit.

### 4.3 Code Review
**Sub-agent**: `code-reviewer`
- Review lifecycle hooks and interval cleanup.

### 4.4 Documentation
**Sub-agent**: `docs-specialist`
- Document platform events and their payloads.

### 4.5 Verification
**Sub-agent**: `architect`
- Verify events are emitted with correct subjects and payloads.

### 4.6 Task Completion
**Sub-agent**: `implementer`
- Append `[DONE]` to Task 6 in TODO file.
- Commit.

---

## Task 7: HTTP Endpoints

### Pre-Analysis
- Need `DiscoveryController` with two GET endpoints: `/manifest` and `/schemas`.
- `/manifest` returns the service manifest (including `payloadSchemaRef`).
- `/schemas` returns all JSON Schemas used by this service (read from persisted files).
- Controller must be registered in `DiscoveryModule`.

### 4.1 Analysis & Planning
**Sub-agent**: `architect`
- Design controller routes and response DTOs.
- Determine how `/schemas` reads from the file system (re-use file persister utility from Task 3).
- Save plan to `.kilo/plans/20260617-task7-http-endpoints.md`.

### 4.2 Implementation
**Sub-agent**: `implementer`
- Create `src/discovery/discovery.controller.ts`.
- Register controller in `DiscoveryModule`.
- Implement `/manifest` and `/schemas` handlers.
- Commit.

### 4.3 Code Review
**Sub-agent**: `code-reviewer`
- Review controller for NestJS best practices and error handling.

### 4.4 Documentation
**Sub-agent**: `docs-specialist`
- Document endpoints in the new discovery doc.

### 4.5 Verification
**Sub-agent**: `architect`
- Verify endpoints return correct data and handle errors gracefully.

### 4.6 Task Completion
**Sub-agent**: `implementer`
- Append `[DONE]` to Task 7 in TODO file.
- Commit.

---

## Task 8: Testing Support for Discovery

### Pre-Analysis
- Need `MockManifestService` and `MockDiscoveryService`.
- Need utilities to capture `platform.service.register.v1` and `platform.service.heartbeat.v1` events emitted during tests.
- Need to extend `EventsToolkitTestModule.forRoot()` to accept Discovery configuration and provide mocks.
- Need a method to manually trigger manifest generation in tests (`generateManifest()`).
- Ensure `/manifest` and `/schemas` endpoints are testable with the test module.

### 4.1 Analysis & Planning
**Sub-agent**: `architect`
- Design mock services mirroring `ManifestService` and `DiscoveryService`.
- Design test utilities for asserting platform events.
- Design `EventsToolkitTestModule.forRoot(options?)` signature to accept discovery config.
- Save plan to `.kilo/plans/20260617-task8-testing-support.md`.

### 4.2 Implementation
**Sub-agent**: `implementer`
- Create `src/testing/mock-manifest.service.ts`.
- Create `src/testing/mock-discovery.service.ts`.
- Update `src/testing/events-toolkit-test.module.ts` to include mocks and accept options.
- Add test assertion helpers for discovery events.
- Commit.

### 4.3 Code Review
**Sub-agent**: `code-reviewer`
- Review mock implementations and test module integration.

### 4.4 Documentation
**Sub-agent**: `docs-specialist`
- Update `docs/testing-utilities.md` with discovery testing examples.
- Add examples linking to README.

### 4.5 Verification
**Sub-agent**: `architect`
- Verify test module compiles and mocks are injectable.

### 4.6 Task Completion
**Sub-agent**: `implementer`
- Append `[DONE]` to Task 8 in TODO file.
- Commit.

---

## Task 9: Documentation Updates

### Pre-Analysis
- Need new doc: `docs/event-discovery-and-service-registry.md`.
- Need to update `docs/event-messaging-convention.md` with `platform.*` subjects.
- Need to link new doc in `README.md`.
- Doc should cover: manifest building, `payloadSchemaRef`, endpoints, schema auto-generation, `platform.service.register.v1` example, future `ms-discovery` integration, annotation guidelines.

### 4.1 Analysis & Planning
**Sub-agent**: `architect`
- Outline new documentation structure.
- Identify all places in existing docs that need updates.
- Save plan to `.kilo/plans/20260617-task9-documentation-updates.md`.

### 4.2 Implementation
**Sub-agent**: `implementer`
- Create `docs/event-discovery-and-service-registry.md`.
- Update `docs/event-messaging-convention.md` with `platform.*` subjects.
- Update `README.md` with links.
- Commit.

### 4.3 Code Review
**Sub-agent**: `code-reviewer`
- Review docs for accuracy, completeness, and grammar.

### 4.4 Documentation
**Sub-agent**: `docs-specialist`
- (Optional) Polish and cross-link docs.

### 4.5 Verification
**Sub-agent**: `architect`
- Verify all links work and docs cover acceptance criteria.

### 4.6 Task Completion
**Sub-agent**: `implementer`
- Append `[DONE]` to Task 9 in TODO file.
- Commit.

---

## Step 5: TODO File Completion

**Sub-agent**: `implementer`
**Scope**: Finalize work and merge.

1. Ensure all tasks in TODO file are marked `[DONE]`.
2. Verify all files are committed in `feat/event-discovery-module`.
3. Switch to `main`, merge `feat/event-discovery-module`.
4. On success: delete feature branch.
5. Push `main` to `origin` ONLY.
6. Rename TODO file to `20260617-todo-0-DONE.md`.

---

## Constraints Verification Summary

| Constraint | How Enforced |
|-----------|-------------|
| Max 200 lines per src file | Each file will be kept under 200 lines; split if needed. |
| Max 50 lines per method | Extract helpers for complex logic. |
| Max 2 indentation levels | Early returns, helper methods. |
| Max 2 params per method | Use deps/options objects. |
| Prefer private members | Public only when required by NestJS DI or external API. |
| Self-documenting code | Descriptive names; minimal inline comments. |
| No commented-out code | Remove any dead code during review cycles. |
| Single-section boolean conditions | Extract complex conditions into named methods. |
