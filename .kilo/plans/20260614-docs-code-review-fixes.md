# Documentation Code Review Fix Plan

**Review Date**: 2026-06-14
**Branch**: `feat/outbox-logging-polish-finalization`
**Scope**: `README.md`, `docs/outbox-configuration.md`, `docs/ai-agent-guidelines.md`
**Reviewer**: Code Reviewer sub-agent

## Summary

The documentation is well-structured and covers all required sections from the TODO file. However, several code examples are inconsistent with the actual public API exported from `src/index.ts`. These mismatches will cause compilation failures or runtime bugs for consumers following the docs.

`docs/outbox-configuration.md` is accurate and requires no changes.

## Issues Found

### 1. README.md — Individual module registration uses non-existent `register()` method

**Location**: README.md, lines 159–176 ("Setup (Individual Modules)")
**Problem**: Examples use `ProducerModule.register(...)` and `ConsumerModule.register(...)`. The actual API exposes only `forRoot()` and `forRootAsync()`.
**Fix**: Replace `register` with `forRoot` for both modules and align option keys (`natsServers`/`producerName` are not valid; use `connection`/`jetStream` per `ProducerModuleOptions`/`ConsumerModuleOptions`).

### 2. README.md & docs/ai-agent-guidelines.md — `@EmitEvent()` example returns an `EventEnvelope`

**Location**:
- README.md, lines 246–253
- docs/ai-agent-guidelines.md, lines 93–100
**Problem**: The interceptor passes the handler's return value as `data` to `ProducerService.emit()`, which then wraps it in a new `EventEnvelope`. Returning an already-built `EventEnvelope` causes double-wrapping.
**Fix**: Change the decorated method to return the plain data payload (`PaymentProofUploadedData`), not `PaymentProofUploadedEvent`. The `EventContext` argument provides the metadata for envelope construction.

### 3. README.md & docs/ai-agent-guidelines.md — `EventContext` examples omit required fields

**Location**:
- README.md, lines 138–147
- docs/ai-agent-guidelines.md, lines 60–65
**Problem**: `EventContext` requires `type`, `version`, `producer`, `companyId`, `actorType`, `actorId`, and `correlationId`. The examples only show `companyId`, `actorType`, `actorId`, and optional fields.
**Fix**: Add the mandatory fields to every `EventContext` example.

### 4. README.md — Request-Reply example uses non-existent `sendAndWait()` method

**Location**: README.md, lines 350–368
**Problem**: The example calls `this.requestReply.sendAndWait<ProofResponse>(subject, requestEvent, { timeout: 10000 })`. The actual method is `request<T, R>(subject, payload, options)` and `options` includes `{ context: EventContext }` plus `timeoutMs`, not `timeout`.
**Fix**: Rewrite the example to use `request<PaymentProofRequestedData, ProofResponse>(subject, payload, { context, timeoutMs: 10000 })` and construct the payload directly.

### 5. README.md — `createEvent()` example uses wrong signature

**Location**: README.md, lines 451–458
**Problem**: Example calls `createEvent<PaymentProofUploadedEvent>({ type: PaymentProofUploadedEvent, data, context })`. The actual signature is `createEvent<T>(data: T, context: EventContext)`.
**Fix**: Rewrite as `createEvent(paymentData, eventContext)` with a fully-populated `EventContext`.

### 6. README.md — Misleading UUID generator guidance

**Location**: README.md, line 490 (AI Agent guideline #2)
**Problem**: "Use `generateUuidV7()` from the toolkit, prefixed with `evt_`" is misleading. `generateUuidV7()` returns a raw UUIDv7; the prefixed ID is produced by `generateEventId()`.
**Fix**: Change to "Use `generateEventId()` from the toolkit, which returns a UUIDv7 prefixed with `evt_`."

## Fix Implementation Steps

1. Open `README.md`.
2. Update "Setup (Individual Modules)" to use `ProducerModule.forRoot` and `ConsumerModule.forRoot` with valid options.
3. Update the `@EmitEvent()` example to return the data payload.
4. Update all `EventContext` snippets to include `type`, `version`, `producer`, and `correlationId`.
5. Rewrite the Request-Reply example to use `requestReply.request<T, R>()` with `context` and `timeoutMs`.
6. Rewrite the `createEvent()` example to match the real two-argument signature.
7. Fix the UUID generator guideline.
8. Open `docs/ai-agent-guidelines.md`.
9. Update the `@EmitEvent()` example to return the data payload.
10. Update all `EventContext` snippets to include required fields.
11. Run `npm run typecheck` or compile doc-adjacent snippets if possible to verify no further API drift.
12. Re-read all three docs to confirm links and references are intact.

## Files to Modify

- `README.md`
- `docs/ai-agent-guidelines.md`

## Files Requiring No Changes

- `docs/outbox-configuration.md` (accurate and complete)
