# Simplification Plan: Task 1 — `subscribe-options.interface.ts`

**File reviewed:** `src/consumer/subscribe-options.interface.ts` (after 4.2 changes)
**Scope:** Simplification of `createDefaultConsumerOpts` and surrounding code.

## Findings

The `createDefaultConsumerOpts` change itself is already minimal and idiomatic:

```typescript
export function createDefaultConsumerOpts(): ConsumerOptsBuilder {
  return consumerOpts().manualAck().ackExplicit().deliverTo(createInbox());
}
```

No structural simplification is possible for the builder chain.

## Minor Readability Improvements

### 1. Move inline type imports to top-level imports

Two interfaces use inline `import('...')` type annotations:

```typescript
export interface ValidationErrorOptions {
  errors: import('class-validator').ValidationError[];
  ...
}

export interface DlqRoutingOptions {
  exception: import('../common/errors/event-consumer.exception').EventConsumerException;
  ...
}
```

Move these to top-level imports alongside the existing `nats` imports:

```typescript
import { AckPolicy, consumerOpts, ConsumerOptsBuilder, ConsumerOpts, createInbox, JsMsg } from 'nats';
import { ValidationError } from 'class-validator';
import { EventConsumerException } from '../common/errors/event-consumer.exception';
```

Then update the interfaces to use the imported types directly:

```typescript
export interface ValidationErrorOptions {
  errors: ValidationError[];
  subject: string;
  plain: Record<string, unknown>;
}

export interface DlqRoutingOptions {
  exception: EventConsumerException;
  msg: JsMsg;
  subject: string;
  originalPayload?: Record<string, unknown>;
}
```

**Rationale:** This is more idiomatic TypeScript, easier to scan, and keeps all dependencies visible in the file header.

### 2. Use the actual type in the `isConsumerOptsBuilder` guard cast

```typescript
export function isConsumerOptsBuilder(value: unknown): value is ConsumerOptsBuilder {
  return typeof (value as Partial<ConsumerOptsBuilder>)?.getOpts === 'function';
}
```

**Rationale:** Replaces the ad-hoc `{ getOpts?: unknown }` cast with `Partial<ConsumerOptsBuilder>`, making the guard directly reference the type it is checking. Behavior is unchanged.

## Not Recommended

- **Removing `defaultDlqSubjectBuilder`:** It is a thin wrapper around `buildDlqSubject`, but it is exported publicly (via `src/consumer/index.ts`) and referenced by multiple services and tests. Removing it would be a breaking change and is outside the scope of this bug-fix task.

- **Inlining `ensureValidConsumerConfig`:** The current implementation separates the defaulted `config` into an intermediate variable, which keeps the logic clear. Collapsing it would trade readability for one fewer line.

## Summary

Apply the two minor readability changes above. No functional simplification is required for `createDefaultConsumerOpts` or `resolveConsumerSubscribeOpts`.
