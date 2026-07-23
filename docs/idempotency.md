# Idempotency

> **Onboarding:** This document covers **step 8 (Idempotency)** of the [Onboarding Flow](../README.md#onboarding-flow).
> **See also:** [Outbox Configuration](outbox-configuration.md) · [Testing Utilities](testing-utilities.md) · [AI Agent Guidelines](ai-agent-guidelines.md)

## Table of Contents

- [Overview](#overview)
- [Why Idempotency Matters](#why-idempotency-matters)
- [When to Use Each Backend](#when-to-use-each-backend)
- [Enabling / Disabling](#enabling--disabling)
- [SQLite Configuration](#sqlite-configuration)
- [PostgreSQL Configuration](#postgresql-configuration)
- [Memory Backend (Tests Only)](#memory-backend-tests-only)
- [IdempotencyServiceOptions Reference](#idempotencyserviceoptions-reference)
- [Manual Usage Patterns](#manual-usage-patterns)
- [Automatic Usage Patterns](#automatic-usage-patterns)
- [Key Generation Best Practices](#key-generation-best-practices)
- [TTL Configuration and Behavior](#ttl-configuration-and-behavior)
- [Interaction with the Outbox](#interaction-with-the-outbox)
- [Testing with MockIdempotencyService](#testing-with-mockidempotencyservice)
- [Migration / FAQ](#migration--faq)

## Overview

The Idempotency module provides consumer-side deduplication for the events-toolkit, mirroring the same design patterns as the Outbox module (repository pattern, SQLite/PostgreSQL/memory backends, configurable via `forRoot()`). It registers a global `IdempotencyRepository` provider and an `IdempotencyService` with low-level (`isDuplicate`, `markAsProcessed`) and high-level (`executeIfNotProcessed`) APIs.

Both tenant (`EventEnvelope`) and global (`GlobalEventEnvelope`) envelopes are supported — the dedup key uses `event.id` + `correlation_id`, which are present on both envelope variants via the shared `BaseEventEnvelope`.

## Why Idempotency Matters

NATS JetStream delivers events with at-least-once semantics. Redelivery can occur due to:

- Consumer restart or crash before acknowledgment
- Network interruptions during the ack window
- NATS server-side redelivery after `maxDeliver` timeout

Without an idempotency guard, each redelivery risks duplicate side effects — double charges, duplicate writes, duplicate notifications.

The Idempotency module solves this by recording processed event keys **before** the handler commits its side effects (or atomically with the handler via `executeIfNotProcessed`). Subsequent deliveries with the same key are skipped.

Idempotency complements but does **not** replace durable consumers:

| Concern | Durable Consumers | Idempotency |
|---------|-------------------|-------------|
| What it prevents | Replay of entire stream history on restart | Re-execution of already-processed events |
| Layer | NATS consumer ack position | Application-level dedup key store |
| When needed | Always in production | When handlers have non-idempotent side effects |

## When to Use Each Backend

| Backend  | Use Case | Service Type |
|----------|----------|--------------|
| Postgres | `ms-db-gateway` + services with existing TypeORM | Shares main DB, no extra file |
| SQLite   | All other microservices | Lightweight file-based; needs Docker volume |
| Memory   | Tests only | Never in production |

- **Postgres** shares the `EntityManagerLike` contract with the Outbox module (`{ query(sql, params) }`); TypeORM-compatible.
- **SQLite** uses a lightweight file-based database — requires a persistent Docker volume for production.
- **Memory** is an in-memory `Map` store. State is lost on restart. Use only for unit tests via `EventsToolkitTestModule`.

## Enabling / Disabling

The `idempotency` field on `EventsToolkitModule.forRoot()` is optional.

- **Omit** the `idempotency` field entirely to skip wiring the idempotency subsystem. The `@OnEvent({ idempotent: true })` flag is a **silent no-op** — handlers run unwrapped.
- **Set `enabled: false`** to keep the config object present but inactive. Same no-op behavior.
- **Set `enabled: true`** (default when the field is present) to activate idempotency.

When enabled, `'idempotency'` is added to the `capabilities` array of the service manifest (`ServiceManifestDto.capabilities`) via `resolveCapabilities()`.

## SQLite Configuration

### Via IdempotencyModule.forRoot

```typescript
import { IdempotencyModule } from '@cobranza-apps/events-toolkit';

@Module({
  imports: [
    IdempotencyModule.forRoot({
      type: 'sqlite',
      sqlitePath: '/data/idempotency.sqlite',
      serviceOptions: { defaultTtlSeconds: 86400 },
    }),
  ],
})
export class AppModule {}
```

### Via EventsToolkitModule.forRoot (Recommended)

```typescript
import { EventsToolkitModule } from '@cobranza-apps/events-toolkit';

@Module({
  imports: [
    EventsToolkitModule.forRoot({
      nats: { servers: ['nats://localhost:4222'] },
      idempotency: {
        type: 'sqlite',
        sqlitePath: '/data/idempotency.sqlite',
        serviceOptions: { defaultTtlSeconds: 86400 },
      },
    }),
  ],
})
export class AppModule {}
```

### Docker Volume (Required for SQLite)

When running in Docker, mount a persistent volume to survive container restarts:

```yaml
volumes:
  - idempotency-data:/data
```

You can reuse the same `/data` volume used for the outbox (different file names) or use a separate path.

## PostgreSQL Configuration

### Via IdempotencyModule.forRoot

```typescript
import { IdempotencyModule } from '@cobranza-apps/events-toolkit';

@Module({
  imports: [
    IdempotencyModule.forRoot({
      type: 'postgres',
      postgres: { entityManager: dataSource.manager },
      serviceOptions: { defaultTtlSeconds: 86400 },
    }),
  ],
})
export class AppModule {}
```

### Via EventsToolkitModule.forRoot (Recommended)

```typescript
import { EventsToolkitModule } from '@cobranza-apps/events-toolkit';

@Module({
  imports: [
    EventsToolkitModule.forRoot({
      nats: { servers: ['nats://localhost:4222'] },
      idempotency: {
        type: 'postgres',
        postgres: { entityManager: dataSource.manager },
        serviceOptions: { defaultTtlSeconds: 86400 },
      },
    }),
  ],
})
export class AppModule {}
```

### EntityManagerLike Contract

The Postgres backend requires an object implementing `EntityManagerLike`:

```typescript
interface EntityManagerLike {
  query(sql: string, parameters?: unknown[]): Promise<unknown>;
}
```

This is the same contract used by the Outbox module. TypeORM's `EntityManager` is compatible out of the box. See [Outbox Configuration](outbox-configuration.md#entitymanagerlike-contract) for the full contract definition.

## Memory Backend (Tests Only)

The in-memory backend stores processed keys in a `Map`. State is lost on restart. Never use in production.

```typescript
idempotency: {
  type: 'memory',
}
```

When using `EventsToolkitTestModule`, a `MockIdempotencyService` is registered automatically — see [Testing with MockIdempotencyService](#testing-with-mockidempotencyservice).

## IdempotencyServiceOptions Reference

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `defaultTtlSeconds` | `number` | omitted (never expires) | Default TTL applied when callers omit `ttlSeconds` on `markAsProcessed` / `executeIfNotProcessed` |

Per-call `ttlSeconds` override always takes precedence over `defaultTtlSeconds`.

## Manual Usage Patterns

Manual usage via `IdempotencyService` is recommended for full control — conditional dedup, custom key handling, multi-step transactions, or per-branch TTL.

### Low-Level: `isDuplicate` + `markAsProcessed`

```typescript
import { IdempotencyService } from '@cobranza-apps/events-toolkit';
import { AnyEventEnvelope } from '@cobranza-apps/events-toolkit';

class PaymentConsumer {
  constructor(private readonly idempotency: IdempotencyService) {}

  async handle(event: AnyEventEnvelope<PaymentData>): Promise<void> {
    if (await this.idempotency.isDuplicate(event)) return;

    await this.processPayment(event.data);

    await this.idempotency.markAsProcessed(event);
  }
}
```

### High-Level: `executeIfNotProcessed`

```typescript
import { IdempotencyService } from '@cobranza-apps/events-toolkit';

class PaymentConsumer {
  constructor(private readonly idempotency: IdempotencyService) {}

  async handle(event: AnyEventEnvelope<PaymentData>): Promise<void> {
    const result = await this.idempotency.executeIfNotProcessed({
      event,
      handler: async () => this.processPayment(event.data),
      ttlSeconds: 3600,
    });

    // result === undefined when duplicate was skipped
    if (result === undefined) return;

    // result contains the handler return value when executed
  }
}
```

**Important:** If the `handler` throws, the event is intentionally **not** marked as processed. This allows redelivery retries. Do NOT catch-and-swallow inside `executeIfNotProcessed` if retry is desired — let the exception propagate so NATS redelivers.

## Automatic Usage Patterns

When `IdempotencyModule` is registered via `EventsToolkitModule.forRoot()` or standalone, both consumer decorators accept an `idempotent: true` flag. Their respective explorers (`OnEventExplorer` and `OnRequestReplyExplorer`) automatically wrap the handler with `IdempotencyService` at startup — skip duplicate → execute handler → mark processed (only on handler success).

### `@OnEvent` — automatic deduplication of event deliveries

```typescript
import { OnEvent } from '@cobranza-apps/events-toolkit';
import { AnyEventEnvelope } from '@cobranza-apps/events-toolkit';

class PaymentProofConsumer {
  @OnEvent('payment.proof.uploaded', {
    version: '1',
    description: 'Handles payment proof uploads',
    payloadExample: { paymentAttemptId: 'uuid', amount: 100 },
    idempotent: true,
  })
  async onProofUploaded(event: AnyEventEnvelope<PaymentProofUploadedData>): Promise<void> {
    // Skipped on redelivery automatically
    await this.processProof(event.data);
  }
}
```

### `@OnRequestReply` — automatic deduplication of response deliveries

The `@OnRequestReply` decorator mirrors `@OnEvent`: when `idempotent: true` is set, `OnRequestReplyExplorer` wraps the response handler identically. This guards against duplicate delivery of the **same response event** (NATS at-least-once redelivery of the reply published on `reply_to`), using the same composite key `${event.id}:${event.correlation_id}`.

```typescript
import { OnRequestReply } from '@cobranza-apps/events-toolkit';
import { EventEnvelope, EventContext } from '@cobranza-apps/events-toolkit';

class PaymentProofResponseHandler {
  @OnRequestReply('payment.proof.uploaded', {
    companyId: '550e8400-e29b-41d4-a716-446655440000',
    description: 'Handles payment proof upload responses',
    payloadExample: { proofId: 'uuid' },
    idempotent: true,
  })
  async handleResponse(
    event: EventEnvelope<PaymentProofData>,
    context: EventContext,
  ): Promise<void> {
    // Skipped on redelivery automatically
    await this.processProof(event.data);
  }
}
```

> **Note:** Unlike `@OnEvent`, `@OnRequestReply` does **not** take a `version` field (it listens for responses on a specific subject rather than declaring an event schema version). The `idempotent` flag is the only extra option added in v0.15.1.

**No-op when module not registered:** If the `IdempotencyModule` is not configured (the `idempotency` field is omitted from `forRoot()`), the `idempotent: true` flag is silently ignored and the handler runs unwrapped.

### Manual vs Automatic Guidance

| Pattern | Decorators | When to use |
|---------|------------|-------------|
| Manual (`IdempotencyService` direct) | — (any consumer) | Conditional dedup, custom key, multi-step transactions, per-branch TTL |
| Automatic (`idempotent: true`) | `@OnEvent`, `@OnRequestReply` | Simple fire-and-forget handlers with default key + TTL; response handlers that should skip duplicate reply deliveries |

## Key Generation Best Practices

The Idempotency module builds the dedup key as:

```
{event.id}:{event.correlation_id}
```

This composite key is produced by `buildIdempotencyKey(event)`, which is exported for custom use:

```typescript
import { buildIdempotencyKey } from '@cobranza-apps/events-toolkit';

const key = buildIdempotencyKey(event);
// e.g. "evt_01JXYZABC123456789012345:987fcdeb-51a2-43e8-9c4f-123456789abc"
```

**Why composite:**

- `event.id` (UUIDv7) uniquely identifies the event instance. Duplicate deliveries of the **same** event instance carry the same `id`, so duplicate detection works.
- `correlation_id` scopes the key to the originating request/flow. If a retry-correlated re-emit produces a new event with a new `id` but the same `correlation_id`, it is NOT collapsed with the original — each event in the chain is deduped independently.

**Rules:**

- Always use `generateUuidV7()` / `generateEventId()` for event IDs.
- Propagate `correlationId` end-to-end (see [Correlation & Causation Best Practices](ai-agent-guidelines.md#correlation--causation-best-practices)).
- Do NOT build dedup keys from mutable fields like `data` contents.

**Custom keys (advanced):** Inject `IDEMPOTENCY_REPOSITORY_TOKEN` directly and call `isProcessed(key)` / `markAsProcessed(key, ttl)` to bypass the service for custom key schemas.

## TTL Configuration and Behavior

TTL (time-to-live) controls how long a processed key is remembered.

- **Default (omitted):** Keys never expire. Safe default for most use cases — once processed, always skipped.
- **`defaultTtlSeconds`** in `serviceOptions`: Applies to all calls that omit `ttlSeconds`.
- **Per-call override:** Pass `ttlSeconds` to `markAsProcessed(event, ttlSeconds)` or `executeIfNotProcessed({ ..., ttlSeconds })`.

Set a TTL when downstream may legitimately reprocess after N time (e.g., replay windows, time-bounded idempotency).

```typescript
serviceOptions: { defaultTtlSeconds: 86400 } // 1 day default

// Per-call override — 1 hour for this specific event
await this.idempotency.markAsProcessed(event, 3600);
```

**Expired key handling:** Expired keys are lazy-filtered on read. For periodic housekeeping, call `IdempotencyRepository.clearExpired()` — this is an optional maintenance operation, not auto-scheduled by the module.

## Interaction with the Outbox

The Idempotency module and Outbox module are **orthogonal**:

- **Outbox** = transactional publish safety (producer side)
- **Idempotency** = consumer-side deduplication

Both are recommended for production handlers with non-idempotent side effects. They use different tables and semantics and can coexist without conflict.

For the Outbox module's configuration and usage, see [Outbox Configuration](outbox-configuration.md).

## Testing with MockIdempotencyService

`MockIdempotencyService` is an in-memory mock registered by default by `EventsToolkitTestModule.forRoot()`. It mirrors the real `IdempotencyService` API and provides additional test helpers.

```typescript
import { Test } from '@nestjs/testing';
import {
  EventsToolkitTestModule,
  MockIdempotencyService,
} from '@cobranza-apps/events-toolkit/testing';

describe('PaymentConsumer', () => {
  let idempotency: MockIdempotencyService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      imports: [EventsToolkitTestModule.forRoot()],
      providers: [PaymentConsumer],
    }).compile();

    idempotency = module.get(MockIdempotencyService);
  });

  afterEach(() => {
    idempotency.clear();
  });

  it('should skip duplicate events', async () => {
    const event = createTestEvent();
    await idempotency.markAsProcessed(event);

    // First call after marking — duplicate, skipped
    const result = await idempotency.executeIfNotProcessed({
      event,
      handler: async () => { throw new Error('should not execute'); },
    });

    expect(result).toBeUndefined();
    expect(idempotency.processedKeys).toContain(buildIdempotencyKey(event));
  });
});
```

| Method / Property | Description |
|-------------------|-------------|
| `isDuplicate(event)` | Returns `true` if the key was already marked |
| `markAsProcessed(event, ttlSeconds?)` | Records the key in an in-memory `Map` |
| `executeIfNotProcessed({ event, handler, ttlSeconds? })` | Atomic check-execute-mark |
| `processedKeys` | Read-only set of recorded keys (for assertions) |
| `count` | Number of recorded keys |
| `clear()` | Resets all recorded keys |

**Disable mocks:** Pass `forRoot({ idempotency: { enabled: false } })` to skip registration.

The mock is aliased in the DI container as `IdempotencyService`, so services injecting `IdempotencyService` receive the mock automatically.

For full documentation of all mock services, see [Testing Utilities](testing-utilities.md).

## Migration / FAQ

### Does it work with `GlobalEventEnvelope`?

Yes. The dedup key uses `event.id` + `event.correlation_id`, which are both present on `BaseEventEnvelope` — the shared base of both `EventEnvelope` and `GlobalEventEnvelope`.

### Does `idempotent: true` error if the module is not registered?

No. When the `IdempotencyModule` is not registered, the `idempotent` flag is a silent no-op. The handler runs unwrapped with no error.

### Can I use `IdempotencyModule.forRoot()` without `EventsToolkitModule`?

Yes. `IdempotencyModule.forRoot()` and `forRootAsync()` are exported for standalone registration in services that do not use the unified module.

### Are expired keys cleaned up automatically?

No. Expired keys are lazy-filtered (not returned by `isProcessed`), but the rows remain in the database. Call `repository.clearExpired()` periodically for maintenance, or rely on the TTL-filtering at query time.

### Migration from 0.x

Idempotency is a new feature in v0.15.0. No migration is needed — omitting the `idempotency` field preserves existing behavior unchanged.
