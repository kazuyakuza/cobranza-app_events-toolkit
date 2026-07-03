# Task A — Implementation Plan: Refactor Decorator Options

**Source TODO:** `.agent/todos/20260629/20260629-todo-0.md` (Items 1–5)
**Global Plan:** `.kilo/plans/20260629-refactor-decorator-options-and-docs.md`
**Branch:** `feat/refactor-decorator-options-and-docs`
**Version:** `0.8.0` (already bumped in Step 3)

---

## Scope

TODO items 1–5:

1. Make `version` (where applicable), `description`, `payloadExample` required in decorator option interfaces.
2. Remove `?? '1'` and `?? ''` fallbacks for `version`/`description` in `ManifestEntryBuilder`. Keep `tags ?? []`.
3. Update decorator specs to pass required fields.
4. Add `ManifestEntryBuilder` spec coverage (`src/discovery/manifest-entry.builder.spec.ts`).
5. Update refactor-specific docs (`event-messaging-convention.md` Section 4.1, `event-discovery-and-service-registry.md` examples) and CHANGELOG.

---

## Critical Findings from Analysis

### Finding 1 — Additional call sites beyond the TODO literal list

TODO item 3 names only the three decorator spec files, but making decorator option fields required **breaks TypeScript compilation** in three additional test files that also invoke the decorators. These MUST be updated atomically in A.2:

- `src/consumer/decorators/on-event.explorer.spec.ts` — 3 decorator calls
- `src/consumer/decorators/on-request-reply.explorer.spec.ts` — 3 decorator calls
- `src/producer/decorators/emit-event-interceptor.spec.ts` — 5 decorator calls

### Finding 2 — Consequential `?? '1'` dead code beyond `ManifestEntryBuilder`

After `version` becomes required (`string`) on `EmitEventMetadata` / `OnEventMetadata`, the `?? '1'` fallbacks in two non-builder files become unreachable dead code and trigger unnecessary-condition lints. Removal is **consequential cleanup** (clearly marked, not new scope):

- `src/producer/decorators/emit-event-interceptor.ts:88` — `buildSubject()`
- `src/consumer/decorators/on-event.explorer.ts:80` — `buildWildcardSubject()`

### Finding 3 — Options object becomes required; Metadata interfaces must mirror

Because the option fields are now required, the 2nd argument to each decorator can no longer be omitted. Signatures change from `options?: ...Options` to `options: ...Options`. The `*Metadata` interfaces must also make `version` (where applicable), `description`, `payloadExample` required — otherwise removing `??` in `ManifestEntryBuilder` would not be type-safe (TS would still infer the property as possibly-undefined).

### Finding 4 — `ManifestEntryBase.payloadExample` stays optional

`payloadExample` is required at the decorator/options layer (so builders receive it), but `ManifestEntryBase.payloadExample` remains optional to avoid a breaking change for any manifest consumers. The builders already pass `metadata.payloadExample` through unchanged.

### Finding 5 — `version` not present on `@OnRequestReply`

`OnRequestReplyOptions` and `OnRequestReplyMetadata` have no `version` field today. Leave it absent. `buildOnRequestReplyEntry()` hardcodes `version: '1'` in the produced entry — unchanged.

---

## Step A.2-1 — Interface & Signature Changes

### File: `src/producer/decorators/emit-event.decorator.ts`

**Diff 1 — `EmitEventMetadata` interface (lines 7–20):**

```diff
- /** Internal stored metadata shape for @EmitEvent. */
- export interface EmitEventMetadata {
-   /** NATS event type identifier (e.g., 'payment.proof.uploaded'). */
-   eventType: string;
-   /** Major semantic version string (defaults to '1'). */
-   version?: string;
-   /** Human-readable description for discovery manifests. */
-   description?: string;
-   /** Arbitrary tags for categorization in discovery manifests. */
-   tags?: string[];
-   /** Explicit payload schema reference (e.g., 'PaymentProofUploadedEvent'). */
-   payloadSchemaRef?: string;
-   /** Example payload object for documentation in discovery manifests. */
-   payloadExample?: Record<string, unknown>;
- }
+ /** Internal stored metadata shape for @EmitEvent. */
+ export interface EmitEventMetadata {
+   /** NATS event type identifier (e.g., 'payment.proof.uploaded'). */
+   eventType: string;
+   /** Major semantic version string (e.g., '1'). */
+   version: string;
+   /** Human-readable description for discovery manifests. */
+   description: string;
+   /** Arbitrary tags for categorization in discovery manifests. */
+   tags?: string[];
+   /** Explicit payload schema reference (e.g., 'PaymentProofUploadedEvent'). */
+   payloadSchemaRef?: string;
+   /** Example payload object for documentation in discovery manifests. */
+   payloadExample: Record<string, unknown>;
+ }
```

**Diff 2 — `EmitEventOptions` interface (lines 22–34):**

```diff
- /** Options for the @EmitEvent() method decorator (second argument). */
- export interface EmitEventOptions {
-   /** Major version number (default: '1'). */
-   version?: string;
-   /** Human-readable description for discovery manifests. */
-   description?: string;
-   /** Arbitrary tags for categorization in discovery manifests. */
-   tags?: string[];
-   /** Explicit payload schema reference (e.g., 'PaymentProofUploadedEvent'). */
-   payloadSchemaRef?: string;
-   /** Example payload object for documentation in discovery manifests. */
-   payloadExample?: Record<string, unknown>;
- }
+ /** Options for the @EmitEvent() method decorator (second argument, required). */
+ export interface EmitEventOptions {
+   /** Major version string (e.g., '1'). Required. */
+   version: string;
+   /** Human-readable description for discovery manifests. Required. */
+   description: string;
+   /** Arbitrary tags for categorization in discovery manifests (defaults to []). */
+   tags?: string[];
+   /** Explicit payload schema reference (e.g., 'PaymentProofUploadedEvent'). */
+   payloadSchemaRef?: string;
+   /** Example payload object for documentation in discovery manifests. Required. */
+   payloadExample: Record<string, unknown>;
+ }
```

**Diff 3 — `@example` in JSDoc (lines 43–46) — add `payloadExample`:**

```diff
-  * @EmitEvent('payment.proof.uploaded', { version: '1', description: 'Proof was uploaded' })
-  * async handleProofUpload(data: ProofData, context: EventContext) {
-  *   return new PaymentProofUploadedEvent(data, context);
-  * }
+  * @EmitEvent('payment.proof.uploaded', {
+  *   version: '1',
+  *   description: 'Proof was uploaded',
+  *   payloadExample: { proofId: 'uuid', amount: 100 },
+  * })
+  * async handleProofUpload(data: ProofData, context: EventContext) {
+  *   return new PaymentProofUploadedEvent(data, context);
+  * }
```

**Diff 4 — `EmitEvent` function signature (line 50) — options becomes required:**

```diff
- export function EmitEvent(eventType: string, options?: EmitEventOptions): MethodDecorator {
+ export function EmitEvent(eventType: string, options: EmitEventOptions): MethodDecorator {
```

### File: `src/consumer/decorators/on-event.decorator.ts`

**Diff 1 — `OnEventMetadata` interface (lines 7–20):** identical field changes as `EmitEventMetadata` (make `version`, `description`, `payloadExample` required).

```diff
- /** Internal stored metadata shape for @OnEvent. */
- export interface OnEventMetadata {
-   /** NATS event type identifier (e.g., 'payment.proof.uploaded'). */
-   eventType: string;
-   /** Major semantic version string (defaults to '1'). */
-   version?: string;
-   /** Human-readable description for discovery manifests. */
-   description?: string;
-   /** Arbitrary tags for categorization in discovery manifests. */
-   tags?: string[];
-   /** Explicit payload schema reference (e.g., 'PaymentProofUploadedEvent'). */
-   payloadSchemaRef?: string;
-   /** Example payload object for documentation in discovery manifests. */
-   payloadExample?: Record<string, unknown>;
- }
+ /** Internal stored metadata shape for @OnEvent. */
+ export interface OnEventMetadata {
+   /** NATS event type identifier (e.g., 'payment.proof.uploaded'). */
+   eventType: string;
+   /** Major semantic version string (e.g., '1'). */
+   version: string;
+   /** Human-readable description for discovery manifests. */
+   description: string;
+   /** Arbitrary tags for categorization in discovery manifests. */
+   tags?: string[];
+   /** Explicit payload schema reference (e.g., 'PaymentProofUploadedEvent'). */
+   payloadSchemaRef?: string;
+   /** Example payload object for documentation in discovery manifests. */
+   payloadExample: Record<string, unknown>;
+ }
```

**Diff 2 — `OnEventOptions` interface (lines 22–34):** identical to `EmitEventOptions` diff pattern.

```diff
- /** Options for the @OnEvent() method decorator (second argument). */
- export interface OnEventOptions {
-   /** Major version number (default: '1'). */
-   version?: string;
-   /** Human-readable description for discovery manifests. */
-   description?: string;
-   /** Arbitrary tags for categorization in discovery manifests. */
-   tags?: string[];
-   /** Explicit payload schema reference (e.g., 'PaymentProofUploadedEvent'). */
-   payloadSchemaRef?: string;
-   /** Example payload object for documentation in discovery manifests. */
-   payloadExample?: Record<string, unknown>;
- }
+ /** Options for the @OnEvent() method decorator (second argument, required). */
+ export interface OnEventOptions {
+   /** Major version string (e.g., '1'). Required. */
+   version: string;
+   /** Human-readable description for discovery manifests. Required. */
+   description: string;
+   /** Arbitrary tags for categorization in discovery manifests (defaults to []). */
+   tags?: string[];
+   /** Explicit payload schema reference (e.g., 'PaymentProofUploadedEvent'). */
+   payloadSchemaRef?: string;
+   /** Example payload object for documentation in discovery manifests. Required. */
+   payloadExample: Record<string, unknown>;
+ }
```

**Diff 3 — `@example` (lines 43–46):** add `payloadExample`.

```diff
-  * @OnEvent('payment.proof.uploaded', { version: '1', description: 'Proof was uploaded' })
+  * @OnEvent('payment.proof.uploaded', {
+  *   version: '1',
+  *   description: 'Proof was uploaded',
+  *   payloadExample: { proofId: 'uuid' },
+  * })
```

**Diff 4 — `OnEvent` signature (line 50):**

```diff
- export function OnEvent(eventType: string, options?: OnEventOptions): MethodDecorator {
+ export function OnEvent(eventType: string, options: OnEventOptions): MethodDecorator {
```

### File: `src/consumer/decorators/on-request-reply.decorator.ts`

**Diff 1 — `OnRequestReplyMetadata` interface (lines 7–20):** NO `version`. Make `description` and `payloadExample` required.

```diff
- /** Internal stored metadata shape for @OnRequestReply. */
- export interface OnRequestReplyMetadata {
-   /** Event type identifier for the request-reply subject (e.g., 'payment.proof.uploaded'). */
-   eventType: string;
-   /** Optional tenant identifier to filter responses by company_id. */
-   companyId?: string;
-   /** Human-readable description for discovery manifests. */
-   description?: string;
-   /** Arbitrary tags for categorization in discovery manifests. */
-   tags?: string[];
-   /** Explicit payload schema reference (e.g., 'PaymentProofUploadedData'). */
-   payloadSchemaRef?: string;
-   /** Example payload object for documentation in discovery manifests. */
-   payloadExample?: Record<string, unknown>;
- }
+ /** Internal stored metadata shape for @OnRequestReply. */
+ export interface OnRequestReplyMetadata {
+   /** Event type identifier for the request-reply subject (e.g., 'payment.proof.uploaded'). */
+   eventType: string;
+   /** Optional tenant identifier to filter responses by company_id. */
+   companyId?: string;
+   /** Human-readable description for discovery manifests. Required. */
+   description: string;
+   /** Arbitrary tags for categorization in discovery manifests. */
+   tags?: string[];
+   /** Explicit payload schema reference (e.g., 'PaymentProofUploadedData'). */
+   payloadSchemaRef?: string;
+   /** Example payload object for documentation in discovery manifests. Required. */
+   payloadExample: Record<string, unknown>;
+ }
```

**Diff 2 — `OnRequestReplyOptions` interface (lines 22–38):**

```diff
- /** Options for the @OnRequestReply() method decorator (second argument). */
- export interface OnRequestReplyOptions {
-   /**
-    * Optional tenant identifier.
-    * When set, the handler is only dispatched for responses whose
-    * `company_id` matches this value.
-    */
-   companyId?: string;
-   /** Human-readable description for discovery manifests. */
-   description?: string;
-   /** Arbitrary tags for categorization in discovery manifests. */
-   tags?: string[];
-   /** Explicit payload schema reference (e.g., 'PaymentProofUploadedData'). */
-   payloadSchemaRef?: string;
-   /** Example payload object for documentation in discovery manifests. */
-   payloadExample?: Record<string, unknown>;
- }
+ /** Options for the @OnRequestReply() method decorator (second argument, required). */
+ export interface OnRequestReplyOptions {
+   /**
+    * Optional tenant identifier.
+    * When set, the handler is only dispatched for responses whose
+    * `company_id` matches this value.
+    */
+   companyId?: string;
+   /** Human-readable description for discovery manifests. Required. */
+   description: string;
+   /** Arbitrary tags for categorization in discovery manifests (defaults to []). */
+   tags?: string[];
+   /** Explicit payload schema reference (e.g., 'PaymentProofUploadedData'). */
+   payloadSchemaRef?: string;
+   /** Example payload object for documentation in discovery manifests. Required. */
+   payloadExample: Record<string, unknown>;
+ }
```

**Diff 3 — `@example` (lines 48–53):** add `description` and `payloadExample`.

```diff
-  * @OnRequestReply('payment.proof.uploaded', { companyId: '550e8400-e29b-41d4-a716-446655440000' })
+  * @OnRequestReply('payment.proof.uploaded', {
+  *   companyId: '550e8400-e29b-41d4-a716-446655440000',
+  *   description: 'Handles upload responses',
+  *   payloadExample: { proofId: 'uuid' },
+  * })
```

**Diff 4 — `OnRequestReply` signature (line 55):**

```diff
- export function OnRequestReply(eventType: string, options?: OnRequestReplyOptions): MethodDecorator {
+ export function OnRequestReply(eventType: string, options: OnRequestReplyOptions): MethodDecorator {
```

---

## Step A.2-2 — Remove `??` Fallbacks in `ManifestEntryBuilder`

### File: `src/discovery/manifest-entry.builder.ts`

**Diff 1 — `buildOnEventEntry()` (lines 48–58):** remove `version ?? '1'` and `description ?? ''`. Keep `tags ?? []`.

```diff
-     const version = metadata.version ?? '1';
-     return {
-       subject: `company.*.${metadata.eventType}.v${version}`,
-       payloadSchemaRef,
-       description: metadata.description ?? '',
-       version,
-       handler: methodName,
-       tags: metadata.tags ?? [],
-       payloadExample: metadata.payloadExample,
-       type: 'event',
-     };
+     return {
+       subject: `company.*.${metadata.eventType}.v${metadata.version}`,
+       payloadSchemaRef,
+       description: metadata.description,
+       version: metadata.version,
+       handler: methodName,
+       tags: metadata.tags ?? [],
+       payloadExample: metadata.payloadExample,
+       type: 'event',
+     };
```

**Diff 2 — `buildOnRequestReplyEntry()` (lines 79–88):** remove `description ?? ''`. Keep `tags ?? []` and hardcoded `version: '1'`.

```diff
      return {
        subject: metadata.eventType,
        payloadSchemaRef,
-       description: metadata.description ?? '',
+       description: metadata.description,
        version: '1',
        handler: methodName,
        tags: metadata.tags ?? [],
        payloadExample: metadata.payloadExample,
        type: 'request-reply',
      };
```

**Diff 3 — `buildEmitEventEntry()` (lines 106–115):** remove `version ?? '1'` and `description ?? ''`. Keep `tags ?? []`.

```diff
-     const version = metadata.version ?? '1';
-     return {
-       subject: `company.${COMPANY_ID_PLACEHOLDER}.${metadata.eventType}.v${version}`,
-       payloadSchemaRef,
-       description: metadata.description ?? '',
-       version,
-       handler: methodName,
-       tags: metadata.tags ?? [],
-       payloadExample: metadata.payloadExample,
-     };
+     return {
+       subject: `company.${COMPANY_ID_PLACEHOLDER}.${metadata.eventType}.v${metadata.version}`,
+       payloadSchemaRef,
+       description: metadata.description,
+       version: metadata.version,
+       handler: methodName,
+       tags: metadata.tags ?? [],
+       payloadExample: metadata.payloadExample,
+     };
```

---

## Step A.2-3 — Consequential Cleanup: Remove Dead `?? '1'` Fallbacks

> These two fallbacks become unreachable after `version` is required on the metadata interfaces. Removing them keeps the codebase consistent with A.2-2 and prevents unnecessary-condition lint failures. Marked as consequential cleanup, not new scope.

### File: `src/producer/decorators/emit-event-interceptor.ts`

**Diff — `buildSubject()` (lines 87–90):**

```diff
    private buildSubject(metadata: EmitEventMetadata, eventContext: EventContext): string {
-     const version = metadata.version ?? '1';
-     return `company.${eventContext.companyId}.${metadata.eventType}.v${version}`;
+     return `company.${eventContext.companyId}.${metadata.eventType}.v${metadata.version}`;
    }
```

### File: `src/consumer/decorators/on-event.explorer.ts`

**Diff — `buildWildcardSubject()` (lines 79–82):**

```diff
    private buildWildcardSubject(metadata: OnEventMetadata): string {
-     const version = metadata.version ?? '1';
-     return `company.*.${metadata.eventType}.v${version}`;
+     return `company.*.${metadata.eventType}.v${metadata.version}`;
    }
```

---

## Step A.2-4 — Update Existing Decorator Specs

> Constants used to keep each call DRY and avoid magic strings per project rules:
> - `EMIT_DESCRIPTION = 'Debt schedule processed'`
> - `EMIT_EXAMPLE = { scheduleId: 'sch-123' }`
> - `ON_EVENT_DESCRIPTION = 'Payment proof was uploaded'`
> - `ON_EVENT_EXAMPLE = { proofId: 'proof-123' }`
> - `REPLY_DESCRIPTION = 'Payment proof upload response'`
> - `REPLY_EXAMPLE = { proofId: 'proof-123' }`
> (Define inline in each spec; small enough to keep local.)

### File: `src/producer/decorators/emit-event.decorator.spec.ts`

**Test 1 (lines 5–14) — "should store metadata on the decorated method via @EmitEvent()":**

```diff
    it('should store metadata on the decorated method via @EmitEvent()', () => {
      class TestProducer {
-       @EmitEvent('payment.proof.uploaded', { version: '2' })
+       @EmitEvent('payment.proof.uploaded', {
+         version: '2',
+         description: 'Payment proof was uploaded',
+         payloadExample: { proofId: 'proof-123' },
+       })
        handleUpload(): void {}
      }

      const metadata = Reflect.getMetadata(EMIT_EVENT_METADATA, TestProducer.prototype.handleUpload) as EmitEventMetadata;
      expect(metadata.eventType).toBe('payment.proof.uploaded');
      expect(metadata.version).toBe('2');
+     expect(metadata.description).toBe('Payment proof was uploaded');
+     expect(metadata.payloadExample).toEqual({ proofId: 'proof-123' });
    });
```

**Test 2 (lines 16–28) — rename and pass required fields:**

```diff
-   it('should store metadata without version via @EmitEvent()', () => {
+   it('should store metadata with version via @EmitEvent()', () => {
      class TestProducer {
-       @EmitEvent('debt.schedule.processed')
+       @EmitEvent('debt.schedule.processed', {
+         version: '1',
+         description: 'Debt schedule processed',
+         payloadExample: { scheduleId: 'sch-123' },
+       })
        handleProcessed(): void {}
      }

      const metadata = Reflect.getMetadata(
        EMIT_EVENT_METADATA,
        TestProducer.prototype.handleProcessed,
      ) as EmitEventMetadata;
      expect(metadata.eventType).toBe('debt.schedule.processed');
-     expect(metadata.version).toBeUndefined();
+     expect(metadata.version).toBe('1');
+     expect(metadata.description).toBe('Debt schedule processed');
+     expect(metadata.payloadExample).toEqual({ scheduleId: 'sch-123' });
    });
```

**Test 3 (lines 30–43) — "should store payloadExample when provided":** add required fields.

```diff
    it('should store payloadExample when provided', () => {
      const payloadExample = { scheduleId: 'sch-123', amount: 250 };

      class TestProducer {
-       @EmitEvent('debt.schedule.processed', { payloadExample })
+       @EmitEvent('debt.schedule.processed', {
+         version: '1',
+         description: 'Debt schedule processed',
+         payloadExample,
+       })
        handleProcessed(): void {}
      }
```

**Test 4 (lines 45–69) — "should store all rich metadata fields":** no structural change needed (already passes all fields). No edit required.

### File: `src/consumer/decorators/on-event.decorator.spec.ts`

**Test 1 (lines 5–17) — "should store metadata on the decorated method via @OnEvent()":**

```diff
    it('should store metadata on the decorated method via @OnEvent()', () => {
      class TestConsumer {
-       @OnEvent('payment.proof.uploaded', { version: '1' })
+       @OnEvent('payment.proof.uploaded', {
+         version: '1',
+         description: 'Payment proof was uploaded',
+         payloadExample: { proofId: 'proof-123' },
+       })
        handleProofUploaded(): void {}
      }

      const metadata = Reflect.getMetadata(
        ON_EVENT_METADATA,
        TestConsumer.prototype.handleProofUploaded,
      ) as OnEventMetadata;
      expect(metadata.eventType).toBe('payment.proof.uploaded');
      expect(metadata.version).toBe('1');
+     expect(metadata.description).toBe('Payment proof was uploaded');
+     expect(metadata.payloadExample).toEqual({ proofId: 'proof-123' });
    });
```

**Test 2 (lines 19–28) — rename and pass required fields:**

```diff
-   it('should store metadata with default version omitted via @OnEvent()', () => {
+   it('should store metadata with version via @OnEvent()', () => {
      class TestConsumer {
-       @OnEvent('debt.schedule.processed')
+       @OnEvent('debt.schedule.processed', {
+         version: '1',
+         description: 'Debt schedule processed',
+         payloadExample: { scheduleId: 'sch-123' },
+       })
        handleProcessed(): void {}
      }

      const metadata = Reflect.getMetadata(ON_EVENT_METADATA, TestConsumer.prototype.handleProcessed) as OnEventMetadata;
      expect(metadata.eventType).toBe('debt.schedule.processed');
-     expect(metadata.version).toBeUndefined();
+     expect(metadata.version).toBe('1');
+     expect(metadata.description).toBe('Debt schedule processed');
+     expect(metadata.payloadExample).toEqual({ scheduleId: 'sch-123' });
    });
```

**Test 3 (lines 30–50) — "should allow multiple methods with different @OnEvent event types":** add required fields to both calls.

```diff
    it('should allow multiple methods with different @OnEvent event types', () => {
      class TestConsumer {
-       @OnEvent('payment.proof.uploaded')
+       @OnEvent('payment.proof.uploaded', {
+         version: '1',
+         description: 'Payment proof was uploaded',
+         payloadExample: { proofId: 'proof-123' },
+       })
        handleProofUploaded(): void {}

-       @OnEvent('debt.schedule.created')
+       @OnEvent('debt.schedule.created', {
+         version: '1',
+         description: 'Debt schedule created',
+         payloadExample: { scheduleId: 'sch-123' },
+       })
        handleScheduleCreated(): void {}
      }
```

**Test 4 (lines 52–65) — "should store payloadExample when provided":** add required fields.

```diff
    it('should store payloadExample when provided', () => {
      const payloadExample = { proofId: 'proof-123', amount: 250 };

      class TestConsumer {
-       @OnEvent('payment.proof.uploaded', { payloadExample })
+       @OnEvent('payment.proof.uploaded', {
+         version: '1',
+         description: 'Payment proof was uploaded',
+         payloadExample,
+       })
        handleProofUploaded(): void {}
      }
```

**Test 5 (lines 67–91) — "should store all rich metadata fields":** no structural change (already passes all fields). No edit required.

### File: `src/consumer/decorators/on-request-reply.decorator.spec.ts`

> Note: no `version` field on `OnRequestReplyOptions`. Required fields are `description` and `payloadExample`.

**Test 1 (lines 10–22) — "should store metadata with eventType and companyId via @OnRequestReply()":**

```diff
    it('should store metadata with eventType and companyId via @OnRequestReply()', () => {
      class TestConsumer {
-       @OnRequestReply('payment.proof.uploaded', { companyId: '550e8400-e29b-41d4-a716-446655440000' })
+       @OnRequestReply('payment.proof.uploaded', {
+         companyId: '550e8400-e29b-41d4-a716-446655440000',
+         description: 'Payment proof upload response',
+         payloadExample: { proofId: 'proof-123' },
+       })
        handleResponse(): void {}
      }

      const metadata = Reflect.getMetadata(
        ON_REQUEST_REPLY_METADATA,
        TestConsumer.prototype.handleResponse,
      ) as OnRequestReplyMetadata;
      expect(metadata.eventType).toBe('payment.proof.uploaded');
      expect(metadata.companyId).toBe('550e8400-e29b-41d4-a716-446655440000');
+     expect(metadata.description).toBe('Payment proof upload response');
+     expect(metadata.payloadExample).toEqual({ proofId: 'proof-123' });
    });
```

**Test 2 (lines 24–36) — "should store metadata with eventType only when companyId is omitted":** add required fields (keep companyId-omitted assertion).

```diff
    it('should store metadata with eventType only when companyId is omitted', () => {
      class TestConsumer {
-       @OnRequestReply('debt.schedule.processed')
+       @OnRequestReply('debt.schedule.processed', {
+         description: 'Debt schedule processed response',
+         payloadExample: { scheduleId: 'sch-123' },
+       })
        handleProcessed(): void {}
      }

      const metadata = Reflect.getMetadata(
        ON_REQUEST_REPLY_METADATA,
        TestConsumer.prototype.handleProcessed,
      ) as OnRequestReplyMetadata;
      expect(metadata.eventType).toBe('debt.schedule.processed');
      expect(metadata.companyId).toBeUndefined();
+     expect(metadata.description).toBe('Debt schedule processed response');
+     expect(metadata.payloadExample).toEqual({ scheduleId: 'sch-123' });
    });
```

**Test 3 (lines 38–60) — "should allow multiple methods with different @OnRequestReply event types":** add required fields.

```diff
    it('should allow multiple methods with different @OnRequestReply event types', () => {
      class TestConsumer {
-       @OnRequestReply('payment.proof.uploaded', { companyId: 'tenant-1' })
+       @OnRequestReply('payment.proof.uploaded', {
+         companyId: 'tenant-1',
+         description: 'Payment proof upload response',
+         payloadExample: { proofId: 'proof-123' },
+       })
        handleProofUploaded(): void {}

-       @OnRequestReply('debt.schedule.created')
+       @OnRequestReply('debt.schedule.created', {
+         description: 'Debt schedule created response',
+         payloadExample: { scheduleId: 'sch-123' },
+       })
        handleScheduleCreated(): void {}
      }
```

**Test 4 (lines 62–75) — "should store payloadExample when provided":** add required fields.

```diff
    it('should store payloadExample when provided', () => {
      const payloadExample = { proofId: 'proof-123' };

      class TestConsumer {
-       @OnRequestReply('payment.proof.uploaded', { payloadExample })
+       @OnRequestReply('payment.proof.uploaded', {
+         description: 'Payment proof upload response',
+         payloadExample,
+       })
        handleResponse(): void {}
      }
```

**Test 5 (lines 77–101) — "should store all rich metadata fields":** already passes all fields. No edit required.

---

## Step A.2-5 — Update Explorer & Interceptor Specs (Consequential)

> These files were NOT listed in TODO item 3 but MUST be updated or TypeScript compilation fails. They invoke the decorators with the old optional-argument signature.

### File: `src/consumer/decorators/on-event.explorer.spec.ts`

**Diff A — `SampleConsumer` class (lines 13–17):**

```diff
  class SampleConsumer {
    handlerInvoked = false;

-   @OnEvent('payment.proof.uploaded', { version: '1' })
+   @OnEvent('payment.proof.uploaded', {
+     version: '1',
+     description: 'Handles payment proof uploads',
+     payloadExample: { proofId: 'proof-123' },
+   })
    handleProofUploaded(): void {
      this.handlerInvoked = true;
    }

-   @OnEvent('debt.schedule.created')
+   @OnEvent('debt.schedule.created', {
+     version: '1',
+     description: 'Handles debt schedule creation',
+     payloadExample: { scheduleId: 'sch-123' },
+   })
    handleScheduleCreated(): void {
      this.handlerInvoked = true;
    }
```

**Diff B — `CustomVersionConsumer` class (lines 31–34):**

```diff
  class CustomVersionConsumer {
    handlerInvoked = false;

-   @OnEvent('client.profile.updated', { version: '2' })
+   @OnEvent('client.profile.updated', {
+     version: '2',
+     description: 'Handles client profile updates',
+     payloadExample: { clientId: 'client-1' },
+   })
    handleUpdated(): void {
      this.handlerInvoked = true;
    }
  }
```

> The test `"should build wildcard subject with default version when not specified"` (lines 74–82) becomes stale because `version` is now always provided. Rename it. The subject `company.*.debt.schedule.created.v1` assertion still holds (the updated `SampleConsumer` now explicitly passes `version: '1'`).

**Diff C — rename test (line 74):**

```diff
-   it('should build wildcard subject with default version when not specified', () => {
+   it('should build wildcard subject with explicit version v1', () => {
```

### File: `src/consumer/decorators/on-request-reply.explorer.spec.ts`

> `@OnRequestReply` required fields: `description` and `payloadExample`; **no `version`**.

**Diff A — `SampleConsumer` class (lines 13–16):**

```diff
-   @OnRequestReply('payment.proof.uploaded', { companyId: 'tenant-1' })
+   @OnRequestReply('payment.proof.uploaded', {
+     companyId: 'tenant-1',
+     description: 'Handles payment proof responses',
+     payloadExample: { proofId: 'proof-123' },
+   })
```

**Diff B — `SampleConsumer` second handler (lines 18–19):**

```diff
-   @OnRequestReply('debt.schedule.created')
+   @OnRequestReply('debt.schedule.created', {
+     description: 'Handles debt schedule responses',
+     payloadExample: { scheduleId: 'sch-123' },
+   })
```

**Diff C — `CompanyScopedConsumer` class (lines 33–34):**

```diff
-   @OnRequestReply('client.profile.updated', { companyId: 'tenant-2' })
+   @OnRequestReply('client.profile.updated', {
+     companyId: 'tenant-2',
+     description: 'Handles client profile responses',
+     payloadExample: { clientId: 'client-1' },
+   })
```

### File: `src/producer/decorators/emit-event-interceptor.spec.ts`

> `@EmitEvent` required fields: `version`, `description`, `payloadExample`. Inline per call below.

**Diff A — Test "should emit event when @EmitEvent metadata is present" (lines 62–64):**

```diff
      class WithMetadataProducer {
-       @EmitEvent('payment.proof.uploaded', { version: '1' }) handleUpload(): void {}
+       @EmitEvent('payment.proof.uploaded', {
+         version: '1',
+         description: 'Proof was uploaded',
+         payloadExample: { proofId: 'proof-123' },
+       }) handleUpload(): void {}
      }
```

**Diff B — Test "should emit event with default version when version is not specified" (lines 78–81):**

```diff
-   it('should emit event with default version when version is not specified', async () => {
+   it('should emit event with explicit version v1', async () => {
      class NoVersionProducer {
-       @EmitEvent('debt.schedule.processed') handleProcessed(): void {}
+       @EmitEvent('debt.schedule.processed', {
+         version: '1',
+         description: 'Schedule processed',
+         payloadExample: { scheduleId: 'sch-1' },
+       }) handleProcessed(): void {}
      }
```

> The subject assertion `company.550e8400-e29b-41d4-a716-446655440000.debt.schedule.processed.v1` still holds because the decorator now passes `version: '1'` explicitly.

**Diff C — Test "should skip emission when EventContext is not found in arguments" (lines 94–96):**

```diff
      class NoContextProducer {
-       @EmitEvent('payment.proof.uploaded') handleUpload(): void {}
+       @EmitEvent('payment.proof.uploaded', {
+         version: '1',
+         description: 'Proof was uploaded',
+         payloadExample: { proofId: 'proof-123' },
+       }) handleUpload(): void {}
      }
```

**Diff D — Test "should find EventContext among multiple arguments" (lines 105–107):**

```diff
      class MultipleArgsProducer {
-       @EmitEvent('payment.proof.uploaded') handleUpload(): void {}
+       @EmitEvent('payment.proof.uploaded', {
+         version: '1',
+         description: 'Proof was uploaded',
+         payloadExample: { proofId: 'p-1' },
+       }) handleUpload(): void {}
      }
```

**Diff E — Test "should return the original handler return value" (lines 117–119):**

```diff
      class ReturnValueProducer {
-       @EmitEvent('payment.proof.uploaded') handleUpload(): void {}
+       @EmitEvent('payment.proof.uploaded', {
+         version: '1',
+         description: 'Proof was uploaded',
+         payloadExample: { proofId: 'proof-123' },
+       }) handleUpload(): void {}
      }
```

---

## Step A.2-6 — Create `src/discovery/manifest-entry.builder.spec.ts`

> Rules verified: ≤200 lines (actual ~150), ≤50 lines/method, ≤2 indentation levels, ≤2 params/func, no magic numbers, self-documenting names, no commented code.

### Complete file content:

```typescript
import 'reflect-metadata';
import { ManifestEntryBuilder } from './manifest-entry.builder';
import { OnEventMetadata } from '../consumer/decorators/on-event.decorator';
import { EmitEventMetadata } from '../producer/decorators/emit-event.decorator';
import { OnRequestReplyMetadata } from '../consumer/decorators/on-request-reply.decorator';

describe('ManifestEntryBuilder', () => {
  const builder = new ManifestEntryBuilder();
  const emptyPayloadExample = {};

  function buildOnEventMetadata(overrides: Partial<OnEventMetadata> = {}): OnEventMetadata {
    return {
      eventType: 'payment.proof.uploaded',
      version: '1',
      description: 'Handles uploaded payment proofs',
      payloadExample: emptyPayloadExample,
      ...overrides,
    };
  }

  function buildEmitEventMetadata(overrides: Partial<EmitEventMetadata> = {}): EmitEventMetadata {
    return {
      eventType: 'payment.proof.uploaded',
      version: '1',
      description: 'A payment proof was uploaded',
      payloadExample: emptyPayloadExample,
      ...overrides,
    };
  }

  function buildOnRequestReplyMetadata(
    overrides: Partial<OnRequestReplyMetadata> = {},
  ): OnRequestReplyMetadata {
    return {
      eventType: 'credit.check.completed',
      description: 'Handles credit check completion responses',
      payloadExample: emptyPayloadExample,
      ...overrides,
    };
  }

  describe('buildOnEventEntry', () => {
    it('should build a consume entry with wildcard subject and event type', () => {
      const metadata = buildOnEventMetadata();

      const entry = builder.buildOnEventEntry(metadata, 'onProofUploaded', {});

      expect(entry.subject).toBe('company.*.payment.proof.uploaded.v1');
      expect(entry.type).toBe('event');
      expect(entry.handler).toBe('onProofUploaded');
      expect(entry.version).toBe('1');
      expect(entry.description).toBe('Handles uploaded payment proofs');
    });

    it('should propagate description and payloadExample without fallbacks', () => {
      const example = { proofId: 'proof-123', amount: 100 };
      const metadata = buildOnEventMetadata({
        description: 'Custom description',
        payloadExample: example,
      });

      const entry = builder.buildOnEventEntry(metadata, 'onProofUploaded', {});

      expect(entry.description).toBe('Custom description');
      expect(entry.payloadExample).toEqual(example);
    });

    it('should default tags to empty array when omitted', () => {
      const metadata = buildOnEventMetadata({ tags: undefined });

      const entry = builder.buildOnEventEntry(metadata, 'onProofUploaded', {});

      expect(entry.tags).toEqual([]);
    });

    it('should preserve provided tags', () => {
      const metadata = buildOnEventMetadata({ tags: ['payment', 'proof'] });

      const entry = builder.buildOnEventEntry(metadata, 'onProofUploaded', {});

      expect(entry.tags).toEqual(['payment', 'proof']);
    });
  });

  describe('buildOnRequestReplyEntry', () => {
    it('should build a consume entry with eventType as subject and request-reply type', () => {
      const metadata = buildOnRequestReplyMetadata();

      const entry = builder.buildOnRequestReplyEntry(metadata, 'onResponse', {});

      expect(entry.subject).toBe('credit.check.completed');
      expect(entry.type).toBe('request-reply');
      expect(entry.handler).toBe('onResponse');
    });

    it('should hardcode version to 1', () => {
      const metadata = buildOnRequestReplyMetadata();

      const entry = builder.buildOnRequestReplyEntry(metadata, 'onResponse', {});

      expect(entry.version).toBe('1');
    });

    it('should propagate description without fallback', () => {
      const metadata = buildOnRequestReplyMetadata({ description: 'Custom response description' });

      const entry = builder.buildOnRequestReplyEntry(metadata, 'onResponse', {});

      expect(entry.description).toBe('Custom response description');
    });

    it('should default tags to empty array when omitted', () => {
      const metadata = buildOnRequestReplyMetadata({ tags: undefined });

      const entry = builder.buildOnRequestReplyEntry(metadata, 'onResponse', {});

      expect(entry.tags).toEqual([]);
    });
  });

  describe('buildEmitEventEntry', () => {
    it('should build a produce entry with companyId placeholder subject', () => {
      const metadata = buildEmitEventMetadata();

      const entry = builder.buildEmitEventEntry(metadata, 'handleUpload', {});

      expect(entry.subject).toBe('company.{companyId}.payment.proof.uploaded.v1');
      expect(entry.handler).toBe('handleUpload');
      expect(entry.version).toBe('1');
    });

    it('should propagate description and payloadExample without fallbacks', () => {
      const example = { proofId: 'proof-123' };
      const metadata = buildEmitEventMetadata({
        description: 'Custom producer description',
        payloadExample: example,
      });

      const entry = builder.buildEmitEventEntry(metadata, 'handleUpload', {});

      expect(entry.description).toBe('Custom producer description');
      expect(entry.payloadExample).toEqual(example);
    });

    it('should default tags to empty array when omitted', () => {
      const metadata = buildEmitEventMetadata({ tags: undefined });

      const entry = builder.buildEmitEventEntry(metadata, 'handleUpload', {});

      expect(entry.tags).toEqual([]);
    });

    it('should use explicit payloadSchemaRef when provided', () => {
      const metadata = buildEmitEventMetadata({ payloadSchemaRef: 'PaymentProofUploadedData' });

      const entry = builder.buildEmitEventEntry(metadata, 'handleUpload', {});

      expect(entry.payloadSchemaRef).toBe('PaymentProofUploadedData');
    });

    it('should return empty payloadSchemaRef when reflect metadata is missing', () => {
      const metadata = buildEmitEventMetadata();

      const entry = builder.buildEmitEventEntry(metadata, 'noParamsMethod', {});

      expect(entry.payloadSchemaRef).toBe('');
    });
  });

  describe('payloadSchemaRef auto-resolution from reflect metadata', () => {
    interface SampleData {
      readonly id: string;
    }

    class ConsumerWithParam {
      onEvent(_event: SampleData): void {}
    }

    it('should resolve payloadSchemaRef from first parameter type for consumers', () => {
      const metadata = buildOnEventMetadata();

      const entry = builder.buildOnEventEntry(
        metadata,
        'onEvent',
        ConsumerWithParam.prototype,
      );

      expect(entry.payloadSchemaRef).toBe('SampleData');
    });

    class ProducerWithReturn {
      handleEvent(): SampleData {
        return { id: 'sample' };
      }
    }

    it('should resolve payloadSchemaRef from return type for producers', () => {
      const metadata = buildEmitEventMetadata();

      const entry = builder.buildEmitEventEntry(
        metadata,
        'handleEvent',
        ProducerWithReturn.prototype,
      );

      expect(entry.payloadSchemaRef).toBe('SampleData');
    });
  });
});
```

---

## Step A.2-7 — Documentation Updates (Refactor-Specific)

### File: `docs/event-messaging-convention.md`

**Diff — Section 4.1 "Decorator Signature Convention" (lines 179–200):**

Replace the entire block from line 179 (the `### 4.1 Decorator Signature Convention` heading) through line 200 (the paragraph about the old object-based signature) with:

````markdown
### 4.1 Decorator Signature Convention

The toolkit provides three event decorators that accept the event type as a **string first argument**, followed by a **required** options object:

```typescript
@EmitEvent('payment.proof.uploaded', {
  version: '1',
  description: 'Proof was uploaded',
  payloadExample: { proofId: 'uuid', amount: 100 },
})
@OnEvent('payment.proof.uploaded', {
  version: '1',
  description: 'Handles uploaded payment proofs',
  payloadExample: { proofId: 'uuid', amount: 100 },
  tags: ['proof'],
})
@OnRequestReply('credit.check.completed', {
  description: 'Handles credit check completion responses',
  payloadExample: { checkId: 'uuid', approved: true },
  companyId: '550e8400-e29b-41d4-a716-446655440000',
})
```

The options object supports rich metadata for discovery manifests:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `version` | `string` | **Yes** for `@EmitEvent` and `@OnEvent` (not applicable to `@OnRequestReply`) | Major version string (e.g., `'1'`) |
| `description` | `string` | **Yes** | Human-readable description; appears in the service manifest |
| `payloadExample` | `Record<string, unknown>` | **Yes** | Example payload object for documentation in discovery manifests |
| `tags` | `string[]` | No (defaults to `[]`) | Arbitrary categorization tags |
| `payloadSchemaRef` | `string` | No (auto-resolved from reflect metadata) | Explicit payload schema class name |
| `companyId` | `string` | No (`@OnRequestReply` only) | Tenant filter for responses |

> **Breaking change (v0.8.0):** `version` (where applicable), `description`, and `payloadExample` are now **required**. Previously they were optional with fallback defaults in `ManifestEntryBuilder` (`?? '1'` for `version`, `?? ''` for `description`). Those fallbacks have been removed because the type system now guarantees presence. The `tags` fallback (`?? []`) is preserved because `tags` remains optional.

The old object-based signature (`@OnEvent({ domain, entity, action })`) has been replaced by the string-first-arg format shown above.
````

### File: `docs/event-discovery-and-service-registry.md`

**Diff 1 — "Without explicit payloadSchemaRef" example (lines 141–148):** add required fields.

````diff
- ### Without explicit `payloadSchemaRef` (auto-resolved):
-
- ```typescript
- @EmitEvent('payment.proof.uploaded', { version: '1' })
- handleUpload(dto: UploadDto, context: EventContext): PaymentProofUploadedData {
-   // payloadSchemaRef resolves to "PaymentProofUploadedData" from the return type
- }
- ```
+ ### Without explicit `payloadSchemaRef` (auto-resolved):
+
+ ```typescript
+ @EmitEvent('payment.proof.uploaded', {
+   version: '1',
+   description: 'A payment proof file was uploaded',
+   payloadExample: { paymentAttemptId: 'uuid', fileUrl: 'https://...', amount: 100, currency: 'MXN' },
+ })
+ handleUpload(dto: UploadDto, context: EventContext): PaymentProofUploadedData {
+   // payloadSchemaRef resolves to "PaymentProofUploadedData" from the return type
+ }
+ ```
````

**Diff 2 — `@OnEvent` example in "Annotating Decorators for Discovery" (lines 454–463):** add `payloadExample`.

````diff
  ```typescript
  @OnEvent('payment.proof.uploaded', {
    version: '1',
    description: 'Processes uploaded payment proofs',
    tags: ['payment', 'proof'],
    payloadSchemaRef: 'PaymentProofUploadedData',
+   payloadExample: {
+     paymentAttemptId: 'uuid',
+     fileUrl: 'https://...',
+     amount: 100,
+     currency: 'MXN',
+   },
  })
  async onProofUploaded(event: EventEnvelope<PaymentProofUploadedData>): Promise<void> {
    // ...
  }
  ```
````

**Diff 3 — `@OnRequestReply` example in "Annotating Decorators for Discovery" (lines 468–477):** add `payloadExample`.

````diff
  ```typescript
  @OnRequestReply('credit.check.completed', {
    companyId: '550e8400-e29b-41d4-a716-446655440000',
    description: 'Handles credit check completion responses',
    tags: ['credit'],
    payloadSchemaRef: 'CreditCheckResultData',
+   payloadExample: {
+     checkId: 'uuid',
+     approved: true,
+     score: 750,
+   },
  })
  async handleCreditCheckResponse(event: EventEnvelope<CreditCheckResultData>): Promise<void> {
    // ...
  }
  ```
````

> Note: The `@EmitEvent` example at lines 434–449 ALREADY includes `payloadExample`. No change needed there.

**Diff 4 — Developer & AI Agent Guidelines item #1 (line 544):** reword since `description` is now enforced by types.

```diff
- 1. **Always annotate event decorators with `description` and `tags`** — these become part of the service manifest and improve discoverability.
+ 1. **Always annotate event decorators with `description`, `payloadExample`, and `tags`** — `description` and `payloadExample` are now **required** by the decorator option types (v0.8.0); `tags` remains optional but recommended. All three become part of the service manifest and improve discoverability.
```

---

## Step A.2-8 — Changelog Entry

### File: `CHANGELOG.md`

Insert the new `[0.8.0]` section **above** the existing `## [0.7.4] - 2026-06-27` line:

```markdown
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
```

> The version bump to `0.8.0` in `package.json` was already performed in Step 3 of the Critical Workflow (global plan). No further `package.json` edit is needed in Task A.

---

## Verification Gates

After completing all A.2 edits, run the following in order. Stop and report if any gate fails.

1. **TypeScript compilation:**
   ```bash
   npm run build
   ```
   Expected: zero errors. Required fields on options + metadata interfaces must compile cleanly across all call sites (including the 3 consequential spec files).

2. **Full test suite:**
   ```bash
   npm test
   ```
   Expected: all tests pass — decorator specs, explorer specs, interceptor spec, and the new `manifest-entry.builder.spec.ts`.

3. **Confirm `??` fallback removal (bash + ripgrep):**
   ```bash
   rg -n "description \?\? ''" src/discovery/manifest-entry.builder.ts
   ```
   Expected: **zero matches**.

4. **Confirm `version` fallbacks removed everywhere in src:**
   ```bash
   rg -n "metadata\.version \?\? '1'" src
   ```
   Expected: **zero matches** (covers `manifest-entry.builder.ts`, `emit-event-interceptor.ts`, `on-event.explorer.ts`).

5. **Confirm `tags` fallback preserved:**
   ```bash
   rg -n "tags \?\? \[\]" src/discovery/manifest-entry.builder.ts
   ```
   Expected: **3 matches** (one per builder method).

6. **Confirm builder spec file exists and respects line/depth rules:**
   ```bash
   wc -l src/discovery/manifest-entry.builder.spec.ts
   ```
   Expected: ≤200 lines (actual ~150).

7. **Confirm no out-of-scope doc files were touched in Task A:**
   ```bash
   git diff --name-only | grep -E "README\.md|docs/(ai-agent-guidelines|request-reply-patterns|outbox-configuration)\.md"
   ```
   Expected: **no output** (these are Task B scope; markdown-only decorator examples there won't break the build and are left for Task B's comprehensive doc overhaul).

8. **Diagnostics (lint):**
   ```bash
   npm run lint -- src/discovery/manifest-entry.builder.spec.ts src/discovery/manifest-entry.builder.ts src/producer/decorators/emit-event.decorator.ts src/consumer/decorators/on-event.decorator.ts src/consumer/decorators/on-request-reply.decorator.ts
   ```
   Expected: zero errors. Specifically check for no "unnecessary condition" warnings on the removed `?? '1'` sites.

---

## Files Modified Summary

| # | File | Change Type |
|---|------|-------------|
| 1 | `src/producer/decorators/emit-event.decorator.ts` | Interface (required fields), signature, JSDoc @example |
| 2 | `src/consumer/decorators/on-event.decorator.ts` | Interface (required fields), signature, JSDoc @example |
| 3 | `src/consumer/decorators/on-request-reply.decorator.ts` | Interface (required fields, no version), signature, JSDoc @example |
| 4 | `src/discovery/manifest-entry.builder.ts` | Remove `??` for version/description; keep `tags ?? []` |
| 5 | `src/producer/decorators/emit-event-interceptor.ts` | Consequential: remove dead `?? '1'` |
| 6 | `src/consumer/decorators/on-event.explorer.ts` | Consequential: remove dead `?? '1'` |
| 7 | `src/producer/decorators/emit-event.decorator.spec.ts` | Add required fields to calls; rename one test; remove `toBeUndefined()` |
| 8 | `src/consumer/decorators/on-event.decorator.spec.ts` | Add required fields to calls; rename one test; remove `toBeUndefined()` |
| 9 | `src/consumer/decorators/on-request-reply.decorator.spec.ts` | Add required fields to calls; keep `companyId` undefined assertions |
| 10 | `src/consumer/decorators/on-event.explorer.spec.ts` | Consequential: add required fields to 3 decorator calls |
| 11 | `src/consumer/decorators/on-request-reply.explorer.spec.ts` | Consequential: add required fields to 3 decorator calls |
| 12 | `src/producer/decorators/emit-event-interceptor.spec.ts` | Consequential: add required fields to 5 decorator calls; rename one test |
| 13 | `src/discovery/manifest-entry.builder.spec.ts` | **NEW** — full builder test coverage |
| 14 | `docs/event-messaging-convention.md` | Section 4.1 options table + code example |
| 15 | `docs/event-discovery-and-service-registry.md` | 3 code examples + 1 guideline wording |
| 16 | `CHANGELOG.md` | New `[0.8.0]` entry |

---

## Out of Task A Scope (Handled by Task B)

The following files contain decorator usages that are **markdown-only** (won't break TypeScript compilation) and are explicitly covered by Task B's comprehensive documentation overhaul. They are **not** touched in Task A:

- `README.md` — decorator usage examples (lines 251, 259, 298, 314, 441, 463)
- `docs/ai-agent-guidelines.md` — decorator usage examples (lines 114, 152, 165)
- `docs/request-reply-patterns.md` — decorator usage examples (lines 229, 265, 419, 497)
- `docs/outbox-configuration.md` — decorator usage example (line 295)
- `.agent/project-info/tech.md` — stale object-based signature examples (lines 128, 140)

These will be updated in Task B to reflect the new required-fields signature as part of the full onboarding-flow rewrite.

---

## Done Criteria for Task A

- [ ] `EmitEventOptions` / `OnEventOptions` have `version: string` (required)
- [ ] `OnRequestReplyOptions` / `OnRequestReplyMetadata` have **no** `version` field
- [ ] All three `*Options` and corresponding `*Metadata` interfaces have `description: string` and `payloadExample: Record<string, unknown>` as required
- [ ] Decorator 2nd argument is required (signature changed from `options?` to `options`)
- [ ] `ManifestEntryBuilder` has no `??` for `version` or `description`
- [ ] `ManifestEntryBuilder` still has `tags ?? []` (3 occurrences)
- [ ] Dead `?? '1'` removed from `emit-event-interceptor.ts` and `on-event.explorer.ts`
- [ ] All decorator specs pass with required fields
- [ ] All explorer/interceptor specs pass with required fields
- [ ] `manifest-entry.builder.spec.ts` exists and passes
- [ ] `npm run build` passes with zero errors
- [ ] `npm test` passes
- [ ] `docs/event-messaging-convention.md` Section 4.1 updated
- [ ] `docs/event-discovery-and-service-registry.md` examples updated
- [ ] `CHANGELOG.md` has `[0.8.0]` entry