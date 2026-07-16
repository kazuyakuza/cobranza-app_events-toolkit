# Task 1 Plan: Add NATS `streamConfig` override support to `StreamAutoCreator` and the consumer options chain

**Source TODO**: `.agent/todos/20260715/20260715-TODO-0.md`
**Parent Global Plan**: `.kilo/plans/20260716-fix-stream-autocreator-maxbytes.md`
**Date**: 2026-07-16
**Branch**: `feat/stream-autocreator-nats-config`

[Project Info: Active]

---

## 1. Pre-Analysis (per-task)

### 1.1 Problem recap
Some NATS server accounts require `max_bytes` on every stream config (`err_code 10113`, HTTP 400). `StreamAutoCreator.buildStreamConfig()` hardcodes `max_bytes: -1`, which the server rejects.

### 1.2 Required public surface
Add an optional `streamConfig?: Partial<StreamConfig>` field at every layer of the consumer options chain so consumers can supply arbitrary NATS stream fields (including `max_bytes`) that win over built-in defaults.

### 1.3 Key technical decisions
1. **`Partial<StreamConfig>` from `nats`** is the override type. Native, no maintenance, supports every NATS field.
2. **Merge order**: built-in default fields → subject-derived `name`/`subjects` → user overrides (`streamConfig`) last. User wins.
3. **Spread safety**: a direct spread `{ ...defaults, name, subjects, ...this.streamConfig }` widens `name` to `string | undefined` because `Partial<StreamConfig>` has `name?: string`. Use `Object.assign(config, this.streamConfig)` on an already-typed `StreamConfig` instance to keep static types intact without casts.
4. **Logging wrapper**: add two generic public methods `logInfo(message, meta?)` and `logError(message, meta?)` to `EventLoggerService`. The existing specialized log methods (e.g. `logEventConsumed`) don't fit stream-creation diagnostics (no `eventId`/`eventType`).
5. **Logger is optional in `StreamAutoCreator`**: existing direct tests construct `new StreamAutoCreator({ connection })` without a logger. Custom-config INFO logs and rejection ERROR logs skip cleanly when `logger` is absent.
6. **Already-injected logger**: `JetStreamConsumerService` and `RequestReplyConsumerService` already receive `deps.logger` from their providers. That logger is forwarded into the `StreamAutoCreator` constructor (no extra provider change needed for the logger).
7. **Version**: `package.json` already shows `0.11.3` (Step 3 of the global plan completed). This task does not bump the version again.
8. **Rules compliance** (`.agent/RULES.md`):
   - Max 200 lines per source file — verified post-change counts below.
   - Max 50 lines per method body — all touched methods stay well under.
   - Max 2 indentation levels — `buildStreamConfig` uses one `if`; `createStream` uses one `try/catch`.
   - Max 2 params per method — every changed surface uses single options objects.
   - Prefer private members — all new `StreamAutoCreator` members are private; only `EventLoggerService.logInfo/logError` are public (required for cross-class use).
   - Self-documenting code — no comments for the obvious; only section-level JSDoc on public types.
   - No commented-out code — verified.

---

## 2. Implementation Steps (atomic, ordered)

Each step lists the exact file path, the old → new snippet, and the rationale. Implementation order respects compile dependency (interfaces first, then consumers, then providers, then wire-up, then tests).

---

### Step 2.1 — Enrich `EventLoggerService` with generic `logInfo` / `logError`

**File**: `src/logging/event-logger.service.ts` (currently 183 lines → ~195 after)

**Why**: `StreamAutoCreator` needs INFO and ERROR logging without event-specific context. Existing methods (`logEventConsumed`, `logEventError`) require `EventLogContext` (`eventId`, `eventType`, `subject`) that doesn't apply to stream-creation lifecycle.

**Change A — add imports (none needed, winston already imported)**.

**Change B — insert two public methods** immediately after the `logOutboxDlq` method (before the private `createLogger`):

Insert after line 108 (end of `logOutboxDlq`):

```ts
  /**
   * Logs a generic informational message with arbitrary structured metadata.
   *
   * Use for lifecycle events that don't fit the specialized `logEvent*` / `logOutbox*` shapes
   * (e.g. JetStream stream auto-creation with custom overrides).
   *
   * @param message - Human-readable log message.
   * @param meta - Optional structured metadata merged into the log entry.
   */
  logInfo(message: string, meta?: Record<string, unknown>): void {
    this.logger.info(message, meta);
  }

  /**
   * Logs a generic error message with arbitrary structured metadata.
   *
   * Use for failures that don't map to the event/DLQ domain (e.g. NATS server rejecting
   * a stream auto-creation request).
   *
   * @param message - Human-readable log message.
   * @param meta - Optional structured metadata merged into the log entry.
   */
  logError(message: string, meta?: Record<string, unknown>): void {
    this.logger.error(message, meta);
  }
```

**Rules check**: method bodies are 1 line each (well under 50). Public visibility is required (cross-class use). File stays under 200 lines (current 183 + ~22 = ~205 → **over limit!**).

> ⚠️ **REVISED**: File at 183 lines + 22 = 205 → exceeds 200-line rule. Mitigation: trim two-line bodies to one-line and drop redundant blank lines:

Compact insertion (still self-documenting via JSDoc):

```ts
  /**
   * Logs a generic informational message with arbitrary structured metadata.
   *
   * Use for lifecycle events that don't fit specialized `logEvent*` / `logOutbox*` shapes
   * (e.g. JetStream stream auto-creation with custom overrides).
   *
   * @param message - Human-readable log message.
   * @param meta - Optional structured metadata merged into the log entry.
   */
  logInfo(message: string, meta?: Record<string, unknown>): void {
    this.logger.info(message, meta);
  }

  /**
   * Logs a generic error message with arbitrary structured metadata.
   *
   * Use for failures that don't map to the event/DLQ domain (e.g. NATS server rejecting
   * a stream auto-creation request).
   *
   * @param message - Human-readable log message.
   * @param meta - Optional structured metadata merged into the log entry.
   */
  logError(message: string, meta?: Record<string, unknown>): void {
    this.logger.error(message, meta);
  }
```

**Recount after insert**: 183 + 24 lines (two blocks, each 12 lines incl. 6-line JSDoc + 3-line signature + 3-line body + 1 blank line) ≈ 207 → still over.

> ⚠️ **FINAL Mitigation**: Split interfaces out of this file. Move the four context interfaces (`EventLogContext`, `EventErrorLogContext`, `OutboxLogContext`, `OutboxErrorLogContext`, plus `EventLoggerOptions`) into a new sibling file `src/logging/event-logger-context.interface.ts`. The service file imports them. This brings `event-logger.service.ts` to well under 200 lines.

**File**: NEW `src/logging/event-logger-context.interface.ts`:

```ts
import * as winston from 'winston';

/** Configuration options for {@link EventLoggerService}. */
export interface EventLoggerOptions {
  /** Winston transports. Defaults to Console if not provided. */
  transports?: winston.transport[];
  /** Minimum log level. Defaults to `'info'`. */
  level?: string;
}

/** Metadata context for standard event log entries. */
export interface EventLogContext {
  /** Unique event identifier. */
  eventId: string;
  /** Event type in dot-notation. */
  eventType: string;
  /** NATS subject the event was published/consumed on. */
  subject: string;
  /** Correlation ID for request chain tracing. Optional. */
  correlationId?: string;
  /** OpenTelemetry trace ID. Optional. */
  traceId?: string;
}

/** Metadata context for error and DLQ event log entries. */
export interface EventErrorLogContext extends EventLogContext {
  /** Error message describing the failure. */
  error: string;
  /** Stack trace of the underlying error. Optional. */
  stack?: string;
  /** Human-readable reason for DLQ routing. Optional. */
  dlqReason?: string;
  /** Number of delivery attempts before routing to DLQ. Optional. */
  retryCount?: number;
}

/** Metadata context for outbox event log entries. */
export interface OutboxLogContext {
  /** Unique event identifier. */
  eventId: string;
  /** Event type in dot-notation. */
  eventType: string;
  /** NATS subject the event will be published to. */
  subject: string;
  /** Current delivery attempt number (0 for initial save). */
  attempt: number;
  /** Correlation ID for request chain tracing. Optional. */
  correlationId?: string;
  /** OpenTelemetry trace ID. Optional. */
  traceId?: string;
}

/** Metadata context for outbox error and DLQ event log entries. */
export interface OutboxErrorLogContext extends OutboxLogContext {
  /** Error message describing the failure. */
  error: string;
  /** Stack trace of the underlying error. Optional. */
  stack?: string;
}
```

**File**: `src/logging/event-logger.service.ts` — replace the inline interfaces/`EventLoggerOptions` block (lines 127–183, 57 lines) with a single import and keep the two new generic methods. Resulting file ≈ 183 − 57 + 24 (new methods) + 1 (new import) = ~151 lines. ✅ Under 200.

**Edits**:

Old (bottom of file, lines 127–183):
```ts
/** Configuration options for {@link EventLoggerService}. */
export interface EventLoggerOptions {
  /** Winston transports. Defaults to Console if not provided. */
  transports?: winston.transport[];
  /** Minimum log level. Defaults to `'info'`. */
  level?: string;
}

/** Metadata context for standard event log entries. */
export interface EventLogContext {
  ...
}

/** Metadata context for error and DLQ event log entries. */
export interface EventErrorLogContext extends EventLogContext {
  ...
}

/** Metadata context for outbox event log entries. */
export interface OutboxLogContext {
  ...
}

/** Metadata context for outbox error and DLQ event log entries. */
export interface OutboxErrorLogContext extends OutboxLogContext {
  ...
}
```

New (replace the bottom block with):
```ts
export {
  EventLoggerOptions,
  EventLogContext,
  EventErrorLogContext,
  OutboxLogContext,
  OutboxErrorLogContext,
} from './event-logger-context.interface';
```

And add to the top imports of `event-logger.service.ts`:
```ts
import {
  EventLoggerOptions,
  EventLogContext,
  EventErrorLogContext,
  OutboxLogContext,
  OutboxErrorLogContext,
} from './event-logger-context.interface';
```

Replace the removed inline interfaces with the import. Keep the `import * as winston from 'winston';` line (still needed for `winston.Logger`, `winston.transports.Console`).

**File**: `src/logging/index.ts` — re-export the new context interfaces so existing barrel consumers keep working:

Add line:
```ts
export { EventLoggerOptions, EventLogContext, EventErrorLogContext, OutboxLogContext, OutboxErrorLogContext } from './event-logger-context.interface';
```

(Read the existing barrel first to append appropriately without duplicate exports.)

**Verification**: `npm run typecheck` resolves unchanged import names; no spec file breakage because interfaces keep the same exported name paths.

---

### Step 2.2 — Add `streamConfig` field to top-level `EventsToolkitConsumerOptions`

**File**: `src/events-toolkit-options.interface.ts` (78 lines → ~82)

Old (line 1):
```ts
import { NatsConnection } from 'nats';
```

New:
```ts
import { NatsConnection, StreamConfig } from 'nats';
```

Old (lines 37–45):
```ts
export interface EventsToolkitConsumerOptions {
  enable?: boolean;
  dlqSubjectBuilder?: (subject: string) => string;
  autoCreateStreams?: boolean;
}
```

New:
```ts
export interface EventsToolkitConsumerOptions {
  enable?: boolean;
  dlqSubjectBuilder?: (subject: string) => string;
  autoCreateStreams?: boolean;
  /**
   * Optional overrides merged over the auto-creator's default JetStream stream config
   * for every stream created via `autoCreateStreams`. Every NATS field is supported
   * (e.g. `max_bytes`, `max_msgs`, `num_replicas`, `max_age`). User-supplied fields win.
   */
  streamConfig?: Partial<StreamConfig>;
}
```

---

### Step 2.3 — Add `streamConfig` to `ConsumerModuleOptions`

**File**: `src/consumer/consumer.module.ts` (176 lines → ~180)

Old (line 4):
```ts
import { JetStreamClient, NatsConnection } from 'nats';
```

New:
```ts
import { JetStreamClient, NatsConnection, StreamConfig } from 'nats';
```

Old (lines 66–74):
```ts
export interface ConsumerModuleOptions {
  connection?: NatsConnection;
  jetStream?: JetStreamClient;
  dlqSubjectBuilder?: (subject: string) => string;
  responseSubjectPattern?: string;
  autoCreateStreams?: boolean;
}
```

New:
```ts
export interface ConsumerModuleOptions {
  connection?: NatsConnection;
  jetStream?: JetStreamClient;
  dlqSubjectBuilder?: (subject: string) => string;
  responseSubjectPattern?: string;
  autoCreateStreams?: boolean;
  /**
   * Optional overrides for the JetStream stream auto-creator. Merged over
   * built-in defaults so user-supplied fields (e.g. `max_bytes`) win.
   */
  streamConfig?: Partial<StreamConfig>;
}
```

---

### Step 2.4 — Add `streamConfig` to sync deps options interfaces

**File**: `src/consumer/sync-jetstream-consumer-deps-options.interface.ts` (16 lines → ~18)

Old (line 1):
```ts
import { JetStreamClient, NatsConnection } from 'nats';
```

New:
```ts
import { JetStreamClient, NatsConnection, StreamConfig } from 'nats';
```

Old (lines 7–16):
```ts
export interface SyncJetStreamConsumerDepsOptions {
  jetStream: JetStreamClient;
  dlqSubjectBuilder?: (subject: string) => string;
  connection?: NatsConnection;
  autoCreateStreams?: boolean;
}
```

New:
```ts
export interface SyncJetStreamConsumerDepsOptions {
  jetStream: JetStreamClient;
  dlqSubjectBuilder?: (subject: string) => string;
  connection?: NatsConnection;
  autoCreateStreams?: boolean;
  /** Optional NATS stream config overrides forwarded to {@link StreamAutoCreator}. */
  streamConfig?: Partial<StreamConfig>;
}
```

**File**: `src/consumer/sync-request-reply-consumer-deps-options.interface.ts` (18 lines → ~20) — same pattern:

Old (line 1):
```ts
import { JetStreamClient, NatsConnection } from 'nats';
```

New:
```ts
import { JetStreamClient, NatsConnection, StreamConfig } from 'nats';
```

Old (lines 7–18):
```ts
export interface SyncRequestReplyConsumerDepsOptions {
  jetStream: JetStreamClient;
  responseSubjectPattern?: string;
  dlqSubjectBuilder?: (subject: string) => string;
  connection?: NatsConnection;
  autoCreateStreams?: boolean;
}
```

New:
```ts
export interface SyncRequestReplyConsumerDepsOptions {
  jetStream: JetStreamClient;
  responseSubjectPattern?: string;
  dlqSubjectBuilder?: (subject: string) => string;
  connection?: NatsConnection;
  autoCreateStreams?: boolean;
  /** Optional NATS stream config overrides forwarded to {@link StreamAutoCreator}. */
  streamConfig?: Partial<StreamConfig>;
}
```

---

### Step 2.5 — Add `streamConfig` to consumer deps interfaces

**File**: `src/consumer/jetstream-consumer-deps.interface.ts` (22 lines → ~24)

Old (line 1):
```ts
import { JetStreamClient, NatsConnection } from 'nats';
```

New:
```ts
import { JetStreamClient, NatsConnection, StreamConfig } from 'nats';
```

Old (lines 9–22):
```ts
export interface JetStreamConsumerDeps {
  jetStream: JetStreamClient;
  consumerService: ConsumerService;
  logger: EventLoggerService;
  dlqSubjectBuilder?: (subject: string) => string;
  connection?: NatsConnection;
  autoCreateStreams?: boolean;
}
```

New:
```ts
export interface JetStreamConsumerDeps {
  jetStream: JetStreamClient;
  consumerService: ConsumerService;
  logger: EventLoggerService;
  dlqSubjectBuilder?: (subject: string) => string;
  connection?: NatsConnection;
  autoCreateStreams?: boolean;
  /** Optional NATS stream config overrides forwarded to {@link StreamAutoCreator}. */
  streamConfig?: Partial<StreamConfig>;
}
```

**File**: `src/consumer/request-reply-consumer-deps.interface.ts` (29 lines → ~31) — same pattern:

Old (line 1):
```ts
import { JetStreamClient, NatsConnection } from 'nats';
```

New:
```ts
import { JetStreamClient, NatsConnection, StreamConfig } from 'nats';
```

Old (lines 10–29):
```ts
export interface RequestReplyConsumerDeps {
  jetStream: JetStreamClient;
  logger: EventLoggerService;
  responseSubjectPattern?: string;
  dlqSubjectBuilder?: (subject: string) => string;
  connection?: NatsConnection;
  autoCreateStreams?: boolean;
}
```

New:
```ts
export interface RequestReplyConsumerDeps {
  jetStream: JetStreamClient;
  logger: EventLoggerService;
  responseSubjectPattern?: string;
  dlqSubjectBuilder?: (subject: string) => string;
  connection?: NatsConnection;
  autoCreateStreams?: boolean;
  /** Optional NATS stream config overrides forwarded to {@link StreamAutoCreator}. */
  streamConfig?: Partial<StreamConfig>;
}
```

---

### Step 2.6 — Extend `StreamAutoCreator` with `streamConfig`, `logger`, and merge/log behavior

**File**: `src/consumer/stream-auto-creator.ts` (107 lines → ~145)

**Full rewrite** (intermediate between current and the new combined file). Insert the `EventLoggerService` import, log-message constants, extended `StreamAutoCreatorDeps`, private fields, and refactored methods. Goal: stay under 200 lines, methods under 50 lines, plus logging overrides and rejections before delegating to NATS.

Old (lines 1–8):
```ts
import { DiscardPolicy, NatsConnection, RetentionPolicy, StorageType, StreamConfig } from 'nats';
import { buildStreamName, NO_STREAM_MATCHES_FRAGMENT, STREAM_NAME_INUSE_FRAGMENT } from './build-stream-name.util';

export interface StreamAutoCreatorDeps {
  connection: NatsConnection;
}
```

New:
```ts
import { DiscardPolicy, NatsConnection, RetentionPolicy, StorageType, StreamConfig } from 'nats';
import { EventLoggerService } from '../logging/event-logger.service';
import { buildStreamName, NO_STREAM_MATCHES_FRAGMENT, STREAM_NAME_INUSE_FRAGMENT } from './build-stream-name.util';

const CUSTOM_CONFIG_LOG_MESSAGE = 'Stream auto-creation with custom config overrides';
const REJECTED_CONFIG_LOG_MESSAGE = 'NATS server rejected stream config';

/** Dependencies required by {@link StreamAutoCreator}. */
export interface StreamAutoCreatorDeps {
  /** Active NATS connection used to access the JetStream manager. */
  connection: NatsConnection;
  /**
   * Optional overrides merged over the auto-creator's default JetStream stream config.
   * User-supplied fields (e.g. `max_bytes`) win over built-in defaults.
   */
  streamConfig?: Partial<StreamConfig>;
  /**
   * Optional structured logger. When provided, custom overrides and server rejections
   * are logged at INFO/ERROR respectively for diagnostics.
   */
  logger?: EventLoggerService;
}
```

Old (lines 20–25 class header):
```ts
export class StreamAutoCreator {
  private readonly connection: NatsConnection;

  constructor(deps: StreamAutoCreatorDeps) {
    this.connection = deps.connection;
  }
```

New:
```ts
export class StreamAutoCreator {
  private readonly connection: NatsConnection;
  private readonly streamConfig?: Partial<StreamConfig>;
  private readonly logger?: EventLoggerService;

  constructor(deps: StreamAutoCreatorDeps) {
    this.connection = deps.connection;
    this.streamConfig = deps.streamConfig;
    this.logger = deps.logger;
  }
```

Old (lines 58–68 `createStream`):
```ts
  private async createStream(
    jsm: Awaited<ReturnType<NatsConnection['jetstreamManager']>>,
    subject: string,
  ): Promise<void> {
    try {
      await jsm.streams.add(this.buildStreamConfig(subject));
    } catch (error) {
      if (this.isStreamNameInUseError(error)) return;
      throw error;
    }
  }
```

New:
```ts
  private async createStream(
    jsm: Awaited<ReturnType<NatsConnection['jetstreamManager']>>,
    subject: string,
  ): Promise<void> {
    const config = this.buildStreamConfig(subject);
    this.logCustomConfig(subject, config);
    try {
      await jsm.streams.add(config);
    } catch (error) {
      if (this.isStreamNameInUseError(error)) return;
      this.logRejectedConfig(subject, config, error);
      throw error;
    }
  }

  private logCustomConfig(subject: string, config: StreamConfig): void {
    if (!this.hasOverrides() || !this.logger) return;
    this.logger.logInfo(CUSTOM_CONFIG_LOG_MESSAGE, { subject, config });
  }

  private logRejectedConfig(subject: string, config: StreamConfig, error: unknown): void {
    if (!this.logger) return;
    const message = error instanceof Error ? error.message : String(error);
    this.logger.logError(REJECTED_CONFIG_LOG_MESSAGE, { subject, config, error: message });
  }

  private hasOverrides(): boolean {
    return Boolean(this.streamConfig && Object.keys(this.streamConfig).length > 0);
  }
```

Old (lines 70–94 `buildStreamConfig`):
```ts
  private buildStreamConfig(subject: string): StreamConfig {
    return {
      name: this.buildStreamName(subject),
      subjects: [subject],
      retention: RetentionPolicy.Limits,
      storage: StorageType.File,
      max_consumers: -1,
      max_msgs: -1,
      max_bytes: -1,
      max_age: 0,
      max_msgs_per_subject: -1,
      max_msg_size: -1,
      discard: DiscardPolicy.Old,
      discard_new_per_subject: false,
      num_replicas: 1,
      sealed: false,
      first_seq: 0,
      duplicate_window: 0,
      allow_rollup_hdrs: false,
      deny_delete: false,
      deny_purge: false,
      allow_direct: false,
      mirror_direct: false,
    };
  }
```

New (split defaults into a private helper and use `Object.assign` to apply overrides without widening types):
```ts
  private buildStreamConfig(subject: string): StreamConfig {
    const config: StreamConfig = {
      ...this.defaultStreamFields(),
      name: this.buildStreamName(subject),
      subjects: [subject],
    };
    if (this.streamConfig) Object.assign(config, this.streamConfig);
    return config;
  }

  private defaultStreamFields(): Partial<StreamConfig> {
    return {
      retention: RetentionPolicy.Limits,
      storage: StorageType.File,
      max_consumers: -1,
      max_msgs: -1,
      max_bytes: -1,
      max_age: 0,
      max_msgs_per_subject: -1,
      max_msg_size: -1,
      discard: DiscardPolicy.Old,
      discard_new_per_subject: false,
      num_replicas: 1,
      sealed: false,
      first_seq: 0,
      duplicate_window: 0,
      allow_rollup_hdrs: false,
      deny_delete: false,
      deny_purge: false,
      allow_direct: false,
      mirror_direct: false,
    };
  }
```

**Method-depth check** — `createStream`: `try { } catch { if return; log; throw; }` — deepest nesting is 2 indents (inside `catch` block). OK.
**Method-length check** — every method body is ≤ 50 lines (longest: `defaultStreamFields` ~22 lines). OK.
**Refactor necessity** — split `defaultStreamFields` for clarity and to keep `buildStreamConfig` short.

**Pre-existing tests** rely on `toHaveBeenCalledWith({ ...exact-fields... })`. Jest uses deep equality (order-insensitive), so adding the defaults via spread produces the same content, and the existing assertions still pass.

---

### Step 2.7 — Forward `streamConfig` through consumer services to `StreamAutoCreator`

**File**: `src/consumer/jetstream-consumer.service.ts` (196 lines → ~196)

Old (lines 48–49):
```ts
    this.streamAutoCreator =
      deps.autoCreateStreams && deps.connection ? new StreamAutoCreator({ connection: deps.connection }) : undefined;
```

New:
```ts
    this.streamAutoCreator =
      deps.autoCreateStreams && deps.connection
        ? new StreamAutoCreator({ connection: deps.connection, streamConfig: deps.streamConfig, logger: deps.logger })
        : undefined;
```

**File**: `src/consumer/request-reply-consumer.service.ts` (125 lines → ~125)

Old (lines 41–42):
```ts
    this.streamAutoCreator =
      deps.autoCreateStreams && deps.connection ? new StreamAutoCreator({ connection: deps.connection }) : undefined;
```

New:
```ts
    this.streamAutoCreator =
      deps.autoCreateStreams && deps.connection
        ? new StreamAutoCreator({ connection: deps.connection, streamConfig: deps.streamConfig, logger: deps.logger })
        : undefined;
```

**Max-args check**: `StreamAutoCreator` constructor takes a single object param — already compliant. The inline object grows from 1 to 3 properties (no method-arg rule involved).

---

### Step 2.8 — Forward `streamConfig` through provider factories

**File**: `src/consumer/consumer-module.providers.ts` (184 lines → ~188)

**Change A — sync JetStream provider factory** (lines 52–65):

Old:
```ts
export function createSyncJetStreamConsumerDepsProvider(options: SyncJetStreamConsumerDepsOptions): Provider {
  return {
    provide: JETSTREAM_CONSUMER_DEPS_TOKEN,
    useFactory: (consumerService: ConsumerService, logger: EventLoggerService) => ({
      jetStream: options.jetStream,
      consumerService,
      logger,
      dlqSubjectBuilder: options.dlqSubjectBuilder,
      connection: options.connection,
      autoCreateStreams: options.autoCreateStreams,
    }),
    inject: [ConsumerService, EventLoggerService],
  };
}
```

New:
```ts
export function createSyncJetStreamConsumerDepsProvider(options: SyncJetStreamConsumerDepsOptions): Provider {
  return {
    provide: JETSTREAM_CONSUMER_DEPS_TOKEN,
    useFactory: (consumerService: ConsumerService, logger: EventLoggerService) => ({
      jetStream: options.jetStream,
      consumerService,
      logger,
      dlqSubjectBuilder: options.dlqSubjectBuilder,
      connection: options.connection,
      autoCreateStreams: options.autoCreateStreams,
      streamConfig: options.streamConfig,
    }),
    inject: [ConsumerService, EventLoggerService],
  };
}
```

**Change B — sync Request-Reply provider factory** (lines 81–94):

Old:
```ts
export function createSyncRequestReplyConsumerDepsProvider(options: SyncRequestReplyConsumerDepsOptions): Provider {
  return {
    provide: REQUEST_REPLY_CONSUMER_DEPS_TOKEN,
    useFactory: (logger: EventLoggerService) => ({
      jetStream: options.jetStream,
      logger,
      responseSubjectPattern: options.responseSubjectPattern,
      dlqSubjectBuilder: options.dlqSubjectBuilder,
      connection: options.connection,
      autoCreateStreams: options.autoCreateStreams,
    }),
    inject: [EventLoggerService],
  };
}
```

New: add `streamConfig: options.streamConfig,` after `autoCreateStreams: options.autoCreateStreams,`.

**Change C — async JetStream provider factory** (lines 150–163):

Old:
```ts
export function createAsyncJetStreamConsumerDepsProvider(): Provider {
  return {
    provide: JETSTREAM_CONSUMER_DEPS_TOKEN,
    useFactory: (combined: JetStreamAsyncDeps, services: ConsumerServicesPair) => ({
      jetStream: combined.connection.jetStream,
      consumerService: services.consumerService,
      logger: services.logger,
      dlqSubjectBuilder: combined.connection.dlqSubjectBuilder,
      connection: combined.connection.connection ?? combined.moduleOptions.connection,
      autoCreateStreams: combined.moduleOptions.autoCreateStreams,
    }),
    inject: [JETSTREAM_CONSUMER_ASYNC_DEPS_TOKEN, CONSUMER_SERVICES_PAIR],
  };
}
```

New: add `streamConfig: combined.moduleOptions.streamConfig,` after `autoCreateStreams: combined.moduleOptions.autoCreateStreams,`.

**Change D — async Request-Reply provider factory** (lines 171–184):

Old:
```ts
export function createAsyncRequestReplyConsumerDepsProvider(): Provider {
  return {
    provide: REQUEST_REPLY_CONSUMER_DEPS_TOKEN,
    useFactory: (combined: RequestReplyAsyncDeps, logger: EventLoggerService) => ({
      jetStream: combined.connection.jetStream,
      logger,
      responseSubjectPattern: combined.moduleOptions.responseSubjectPattern,
      dlqSubjectBuilder: combined.connection.dlqSubjectBuilder,
      connection: combined.connection.connection ?? combined.moduleOptions.connection,
      autoCreateStreams: combined.moduleOptions.autoCreateStreams,
    }),
    inject: [REQUEST_REPLY_CONSUMER_ASYNC_DEPS_TOKEN, EventLoggerService],
  };
}
```

New: add `streamConfig: combined.moduleOptions.streamConfig,` after `autoCreateStreams: combined.moduleOptions.autoCreateStreams,`.

---

### Step 2.9 — Forward `streamConfig` through `ConsumerModule.forRoot`

**File**: `src/consumer/consumer.module.ts` (still ~178 after Step 2.3)

Old (lines 107–120):
```ts
        createSyncJetStreamConsumerDepsProvider({
          jetStream,
          dlqSubjectBuilder: options.dlqSubjectBuilder,
          connection: options.connection,
          autoCreateStreams: options.autoCreateStreams,
        }),
        createRequestReplyExplorerDepsProvider(),
        createSyncRequestReplyConsumerDepsProvider({
          jetStream,
          responseSubjectPattern: options.responseSubjectPattern,
          dlqSubjectBuilder: options.dlqSubjectBuilder,
          connection: options.connection,
          autoCreateStreams: options.autoCreateStreams,
        }),
```

New:
```ts
        createSyncJetStreamConsumerDepsProvider({
          jetStream,
          dlqSubjectBuilder: options.dlqSubjectBuilder,
          connection: options.connection,
          autoCreateStreams: options.autoCreateStreams,
          streamConfig: options.streamConfig,
        }),
        createRequestReplyExplorerDepsProvider(),
        createSyncRequestReplyConsumerDepsProvider({
          jetStream,
          responseSubjectPattern: options.responseSubjectPattern,
          dlqSubjectBuilder: options.dlqSubjectBuilder,
          connection: options.connection,
          autoCreateStreams: options.autoCreateStreams,
          streamConfig: options.streamConfig,
        }),
```

> `forRootAsync` does NOT need a direct change — the async provider factories already pull from `moduleOptions.streamConfig` (Step 2.8).

---

### Step 2.10 — Forward `streamConfig` through `EventsToolkitModule` sync and async build paths

**File**: `src/events-toolkit.module.ts` (183 lines → ~185)

**Change A — sync imports** (lines 107–115):

Old:
```ts
  if (options.consumer?.enable !== false) {
    const consumerOpts: ConsumerModuleOptions = {
      jetStream: resolved.jetStream,
      connection: resolved.connection,
      dlqSubjectBuilder: options.consumer?.dlqSubjectBuilder,
      autoCreateStreams: options.consumer?.autoCreateStreams,
    };
    imports.push(ConsumerModule.forRoot(consumerOpts));
  }
```

New:
```ts
  if (options.consumer?.enable !== false) {
    const consumerOpts: ConsumerModuleOptions = {
      jetStream: resolved.jetStream,
      connection: resolved.connection,
      dlqSubjectBuilder: options.consumer?.dlqSubjectBuilder,
      autoCreateStreams: options.consumer?.autoCreateStreams,
      streamConfig: options.consumer?.streamConfig,
    };
    imports.push(ConsumerModule.forRoot(consumerOpts));
  }
```

**Change B — async imports** (lines 147–162):

Old:
```ts
function buildConsumerAsyncImport(): DynamicModule {
  return ConsumerModule.forRootAsync({
    useFactory: async (...args: unknown[]): Promise<ConsumerModuleOptions> => {
      const jetStream = args[0] as JetStreamClient;
      const opts = args[1] as EventsToolkitModuleOptions;
      const connection = args[2] as NatsConnection;
      return {
        jetStream,
        connection,
        dlqSubjectBuilder: opts.consumer?.dlqSubjectBuilder,
        autoCreateStreams: opts.consumer?.autoCreateStreams,
      };
    },
    inject: [JETSTREAM_TOKEN, EVENTS_TOOLKIT_OPTIONS, NATS_CONNECTION_TOKEN],
  });
}
```

New: add `streamConfig: opts.consumer?.streamConfig,` after `autoCreateStreams: opts.consumer?.autoCreateStreams,`.

**File stays under 200 lines** (183 + 2 = 185). ✅

---

### Step 2.11 — Update barrel exports for the split context interfaces (if needed)

**File**: `src/consumer/index.ts` — `StreamAutoCreatorDeps` is already exported (line 41). `JetStreamConsumerDeps` and `RequestReplyConsumerDeps` are exported (lines 25, 38). No new symbol needs to be added to this barrel.

**File**: `src/logging/index.ts` — add re-export of the new context interfaces module after Step 2.1.

**File**: `src/index.ts` — verify root barrel re-exports of `EventLogContext`, `EventErrorLogContext`, `OutboxLogContext`, `OutboxErrorLogContext`, `EventLoggerOptions` still resolve (via the logging barrel). Read `src/index.ts` first; if it imports from `'./logging'` via wildcard, the move is transparent. If it imports directly from `'./logging/event-logger.service'`, update the import paths.

---

## 3. Test Strategy

All test specs use Jest globals (`describe`, `it`, `expect`, `jest.fn`).

### Step 3.1 — Extend `src/consumer/stream-auto-creator.spec.ts`

**File**: `src/consumer/stream-auto-creator.spec.ts` (103 lines → ~165)

Add a new `describe('with streamConfig overrides', ...)` block covering the merge and logging behavior. Also extend existing tests minimally.

Add a `createMockLogger()` helper at the top:
```ts
function createMockLogger(): {
  logInfo: jest.Mock;
  logError: jest.Mock;
} {
  return { logInfo: jest.fn(), logError: jest.fn() };
}
```

New tests inside the `StreamAutoCreator` describe block (insert after the rethrow tests):

```ts
  describe('with streamConfig overrides', () => {
    it('should merge overrides over defaults (user max_bytes wins)', async () => {
      const { connection, jetStreamManagerMock } = createMockConnection();
      jetStreamManagerMock.find.mockRejectedValue(new Error('no stream matches subject'));
      jetStreamManagerMock.add.mockResolvedValue({});
      const creator = new StreamAutoCreator({
        connection: connection,
        streamConfig: { max_bytes: 100_000 },
      });

      await creator.ensureStreamExists('test.subject');

      const sent = jetStreamManagerMock.add.mock.calls[0][0] as { max_bytes: number };
      expect(sent.max_bytes).toBe(100_000);
      expect(sent.name).toBe('auto-test-subject');
      expect(sent.subjects).toEqual(['test.subject']);
      expect(sent.retention).toBe(RetentionPolicy.Limits);
    });

    it('should INFO-log overrides when logger is provided and overrides exist', async () => {
      const { connection, jetStreamManagerMock } = createMockConnection();
      const logger = createMockLogger();
      jetStreamManagerMock.find.mockRejectedValue(new Error('no stream matches subject'));
      jetStreamManagerMock.add.mockResolvedValue({});
      const creator = new StreamAutoCreator({
        connection,
        streamConfig: { max_bytes: 100_000 },
        logger,
      });

      await creator.ensureStreamExists('test.subject');

      expect(logger.logInfo).toHaveBeenCalledTimes(1);
      const [message, meta] = logger.logInfo.mock.calls[0];
      expect(message).toBe('Stream auto-creation with custom config overrides');
      expect((meta as { subject: string }).subject).toBe('test.subject');
      expect((meta as { config: { max_bytes: number } }).config.max_bytes).toBe(100_000);
    });

    it('should not INFO-log when no streamConfig is provided', async () => {
      const { connection, jetStreamManagerMock } = createMockConnection();
      const logger = createMockLogger();
      jetStreamManagerMock.find.mockRejectedValue(new Error('no stream matches subject'));
      jetStreamManagerMock.add.mockResolvedValue({});
      const creator = new StreamAutoCreator({ connection, logger });

      await creator.ensureStreamExists('test.subject');

      expect(logger.logInfo).not.toHaveBeenCalled();
    });

    it('should ERROR-log server rejection and rethrow unknown errors', async () => {
      const { connection, jetStreamManagerMock } = createMockConnection();
      const logger = createMockLogger();
      jetStreamManagerMock.find.mockRejectedValue(new Error('no stream matches subject'));
      jetStreamManagerMock.add.mockRejectedValue(new Error('account requires a stream config to have max bytes set'));
      const creator = new StreamAutoCreator({ connection, logger });

      await expect(creator.ensureStreamExists('test.subject')).rejects.toThrow(
        'account requires a stream config to have max bytes set',
      );
      expect(logger.logError).toHaveBeenCalledTimes(1);
      const [message, meta] = logger.logError.mock.calls[0];
      expect(message).toBe('NATS server rejected stream config');
      expect((meta as { subject: string }).subject).toBe('test.subject');
      expect((meta as { error: string }).error).toContain('max bytes set');
    });

    it('should not ERROR-log race-condition errors (stream name in use)', async () => {
      const { connection, jetStreamManagerMock } = createMockConnection();
      const logger = createMockLogger();
      jetStreamManagerMock.find.mockRejectedValue(new Error('no stream matches subject'));
      jetStreamManagerMock.add.mockRejectedValue(new Error('stream name already in use'));
      const creator = new StreamAutoCreator({ connection, logger });

      await expect(creator.ensureStreamExists('test.subject')).resolves.toBeUndefined();
      expect(logger.logError).not.toHaveBeenCalled();
    });
  });
```

**Pre-existing test compatibility** — the existing five tests construct `new StreamAutoCreator({ connection })` without `streamConfig`/`logger`. `hasOverrides()` returns `false` so no logs are attempted; `logRejectedConfig` short-circuits because `this.logger` is `undefined`. Pre-existing assertions about `toHaveBeenCalledWith({...defaults + name + subjects})` still hold because `buildStreamConfig` produces the same set of key/value pairs via the refactored `Object.assign(config, undefined)` no-op when `streamConfig` is undefined.

Update the existing default-config expectation test to reflect the deep-equality semantics (no change required because Jest is order-insensitive — it should already pass unchanged).

### Step 3.2 — Extend `src/consumer/jetstream-consumer.service.auto-create.spec.ts`

**File**: `src/consumer/jetstream-consumer.service.auto-create.spec.ts` (110 lines → ~170)

Extend `buildServiceWithAutoCreate` options to accept `streamConfig`. Extend mock logger to include `logInfo`/`logError`:

```ts
  let mockLogger: {
    logEventConsumed: jest.Mock;
    logEventError: jest.Mock;
    logEventDlq: jest.Mock;
    logEventEmitted: jest.Mock;
    logInfo: jest.Mock;
    logError: jest.Mock;
  };
  ...
  beforeEach(() => {
    ...
    mockLogger = {
      logEventConsumed: jest.fn(),
      logEventError: jest.fn(),
      logEventDlq: jest.fn(),
      logEventEmitted: jest.fn(),
      logInfo: jest.fn(),
      logError: jest.fn(),
    };
    ...
  });

  async function buildServiceWithAutoCreate(
    options: { connection?: unknown; autoCreateStreams?: boolean; streamConfig?: Record<string, unknown> } = {},
  ): Promise<JetStreamConsumerService> {
    const module = await Test.createTestingModule({
      providers: [
        {
          provide: JETSTREAM_CONSUMER_DEPS_TOKEN,
          useFactory: (cs: ConsumerService, logger: EventLoggerService) => ({
            jetStream,
            consumerService: cs,
            logger,
            dlqSubjectBuilder: defaultDlqSubjectBuilder,
            connection: options.connection,
            autoCreateStreams: options.autoCreateStreams,
            streamConfig: options.streamConfig,
          }),
          inject: [ConsumerService, EventLoggerService],
        },
        { provide: EventLoggerService, useValue: mockLogger },
        ConsumerService,
        JetStreamConsumerService,
      ],
    }).compile();
    return module.get(JetStreamConsumerService);
  }
```

Add new tests:

```ts
  it('forwards streamConfig overrides to jetStreamManager.streams.add', async () => {
    jetStreamManagerMock.streams.find.mockRejectedValue(new Error('no stream matches subject'));
    const serviceWithAuto = await buildServiceWithAutoCreate({
      connection: connectionMock,
      autoCreateStreams: true,
      streamConfig: { max_bytes: 42 },
    });
    const asyncIterable = (async function* () {})();
    jetStream.subscribe.mockResolvedValue(asyncIterable);

    await serviceWithAuto.subscribe({ subject: testSubject, handler: jest.fn() });

    const sent = jetStreamManagerMock.streams.add.mock.calls[0][0] as { max_bytes: number };
    expect(sent.max_bytes).toBe(42);
  });

  it('INFO-logs custom overrides via the injected logger', async () => {
    jetStreamManagerMock.streams.find.mockRejectedValue(new Error('no stream matches subject'));
    const serviceWithAuto = await buildServiceWithAutoCreate({
      connection: connectionMock,
      autoCreateStreams: true,
      streamConfig: { max_bytes: 42 },
    });
    const asyncIterable = (async function* () {})();
    jetStream.subscribe.mockResolvedValue(asyncIterable);

    await serviceWithAuto.subscribe({ subject: testSubject, handler: jest.fn() });

    expect(mockLogger.logInfo).toHaveBeenCalledTimes(1);
  });
```

The existing race-condition swallow test continues to pass because the `logger.logError` is only called when the error isn't a "name in use" race.

### Step 3.3 — Extend `src/consumer/request-reply-consumer.service.auto-create.spec.ts`

**File**: `src/consumer/request-reply-consumer.service.auto-create.spec.ts` (95 lines → ~150)

Same pattern as Step 3.2: extend mock logger with `logInfo`/`logError`; extend `buildServiceWithAutoCreate` options; add an `it('forwards streamConfig overrides ...')` test mirroring Step 3.2. The factory at line 39 currently omits `streamConfig`; add `streamConfig: options.streamConfig`.

### Step 3.4 — Extend `src/consumer/consumer.module.auto-create.spec.ts`

**File**: `src/consumer/consumer.module.auto-create.spec.ts` (72 lines → ~110)

Add three tests verifying provider propagation:

```ts
  it('should forward streamConfig to JetStream consumer deps via forRoot', () => {
    const overrides = { max_bytes: 1000 };
    const dynamicModule = ConsumerModule.forRoot({
      jetStream: mockJetStream,
      autoCreateStreams: true,
      streamConfig: overrides,
    });

    const depsProvider = dynamicModule.providers?.find(
      (p) => 'provide' in p && p.provide === JETSTREAM_CONSUMER_DEPS_TOKEN,
    ) as { provide: string; useFactory: (...args: unknown[]) => Record<string, unknown> };
    expect(depsProvider).toBeDefined();

    const mockCS = {} as ConsumerService;
    const result = depsProvider.useFactory(mockCS, mockLogger);
    expect(result.streamConfig).toBe(overrides);
  });

  it('should forward streamConfig to Request-Reply consumer deps via forRoot', () => {
    const overrides = { max_bytes: 1000 };
    const dynamicModule = ConsumerModule.forRoot({
      jetStream: mockJetStream,
      responseSubjectPattern: 'custom.response.v1',
      streamConfig: overrides,
    });

    const depsProvider = dynamicModule.providers?.find(
      (p) => 'provide' in p && p.provide === REQUEST_REPLY_CONSUMER_DEPS_TOKEN,
    ) as { provide: string; useFactory: (...args: unknown[]) => Record<string, unknown> };
    expect(depsProvider).toBeDefined();

    const result = depsProvider.useFactory(mockLogger) as Record<string, unknown>;
    expect(result.streamConfig).toBe(overrides);
  });

  it('should surface streamConfig from ConsumerModuleOptions via forRootAsync', async () => {
    const overrides = { max_bytes: 1000 };
    const dynamicModule = ConsumerModule.forRootAsync({
      useFactory: async () => ({ jetStream: mockJetStream, streamConfig: overrides }),
    });

    const depsProvider = dynamicModule.providers?.find(
      (p) => 'provide' in p && p.provide === JETSTREAM_CONSUMER_DEPS_TOKEN,
    ) as { provide: string; useFactory: (...args: unknown[]) => Record<string, unknown>; inject: unknown[] };
    expect(depsProvider).toBeDefined();

    const mockCS = {} as ConsumerService;
    const mockPair = { consumerService: mockCS, logger: mockLogger };
    const combined = {
      connection: { jetStream: mockJetStream, connection: undefined },
      moduleOptions: { jetStream: mockJetStream, streamConfig: overrides },
    };

    const result = depsProvider.useFactory(combined, mockPair);
    expect(result.streamConfig).toBe(overrides);
  });
```

Add the import:
```ts
import { REQUEST_REPLY_CONSUMER_DEPS_TOKEN } from './request-reply-consumer-deps.interface';
```

### Step 3.5 — Existing specs that touch `EventLoggerService` mocks

**Affected specs** (mock the logger object with only the specialized methods). To avoid breaking the `logInfo`/`logError` undefined call paths in specs that don't exercise stream creation logging, the mocks only need the new methods when the test exercises auto-create with overrides. The cleanup path for the existing `stream-auto-creator.spec.ts` rethrow test (no logger provided) doesn't require logging methods at all.

Search for specs that build `EventLoggerService` mocks to confirm no spec directly calls `.logInfo`/`.logError` already (none do — they are new); add `logInfo: jest.fn(), logError: jest.fn()` to any spec where the new code path may run.

Specs to scan (and patch only if needed):
- `src/events-toolkit.module.di.spec.ts` — uses a real Nest DI compilation. Should compile unchanged because `EventLoggerService` keeps all existing public methods.
- `src/logging/event-logger.service.spec.ts` — add unit tests for the new `logInfo`/`logError` methods (and possibly update imports if it uses the relocated context interfaces; read the file before editing).
- Any spec that does `as unknown as EventLoggerService` cast — works unchanged.

### Step 3.6 — New unit tests for `EventLoggerService.logInfo` / `logError`

**File**: `src/logging/event-logger.service.spec.ts` — read first, then add:
```ts
  it('logInfo delegates to winston info', () => {
    const logger = new EventLoggerService({ transports: [] });
    // Access the private winston logger via the public path; spy through a fake transport.
    ...
  });
```

Better approach: pass a custom in-memory transport that records messages, then assert. The existing spec already demonstrates pattern (read it first). Add minimal positive tests asserting the winston logger receives the message and meta. If the existing spec uses `jest.spyOn(winston, 'createLogger')` style or accesses transports, match that.

If the file is near 200 lines after additions, extract the new tests to a sibling spec like `src/logging/event-logger.service.generic-log.spec.ts`. Decide based on file size after reading.

### Step 3.7 — Run the full test suite

Console commands (per global plan / `package.json`):
- `npm run typecheck` — TypeScript strict compile.
- `npm run lint` — ESLint pass.
- `npm run build` — production build (also runs `pretest` hook).
- `npm test` — Jest unit suite (includes `pretest` build step).

If any test or typecheck fails, iterate within the implementation sub-task (4.2), do not relitigate this plan.

---

## 4. Documentation Updates (delegated to step 4.4 of the global plan but itemized here for the implementer's awareness)

> Per Roll Restriction: only Plan Agent and Docs Specialist may update `.md` files. **Do NOT update docs in Task 1's implementation sub-step.** The below sections are reference notes for step 4.4 of the broader Critical Workflow.

### Step 4.1 — `docs/nats-jetstream-configuration.md`
Under "Stream Auto-Creation → How It Works", add a subsection "Custom Stream Config Overrides" with:

```typescript
import { EventsToolkitModule } from '@cobranza-apps/events-toolkit';
import { StorageType } from 'nats';

EventsToolkitModule.forRoot({
  nats: { servers: ['nats://localhost:4222'] },
  consumer: {
    enable: true,
    autoCreateStreams: true,
    streamConfig: {
      max_bytes: 10 * 1024 * 1024, // required by NATS accounts enforcing stream-level size caps
      num_replicas: 3,
      max_age: 7 * 24 * 60 * 60 * 1_000_000_000,
    },
  },
});
```

Also add a note: "When the NATS server rejects the merged config (auth, permissions, or `account requires a stream config to have max bytes set`), `StreamAutoCreator` logs the rejected config at ERROR level before rethrowing the original `NatsError`."

### Step 4.2 — `CHANGELOG.md`
Insert a new `## [0.11.3] — 2026-07-16` section above `## [0.11.2]`:

```markdown
## [0.11.3] — 2026-07-16

### Added

- **`consumer.streamConfig?: Partial<StreamConfig>`** — optional NATS stream configuration overrides applied by `StreamAutoCreator` when `autoCreateStreams` is enabled. User-supplied fields are merged over the built-in defaults so any NATS field (e.g. `max_bytes`, `max_msgs`, `num_replicas`, `max_age`, `duplicate_window`) is supported natively without new per-field options. Fixes `NatsError: account requires a stream config to have max bytes set` (HTTP 400, `err_code 10113`) on NATS accounts that mandate `max_bytes`.
- `EventLoggerService.logInfo(message, meta?)` and `EventLoggerService.logError(message, meta?)` — generic structured logging entry points for lifecycle events outside the event/DLQ domain.

### Changed

- `StreamAutoCreator` now accepts `streamConfig?: Partial<StreamConfig>` and `logger?: EventLoggerService` in its deps. When overrides are provided with a logger, the merged config is INFO-logged before sending to NATS. When the server rejects a config (any error type including auth/permissions), the rejected config and error message are ERROR-logged before rethrowing the original `NatsError`.
- `StreamAutoCreator` now uses `Object.assign` to apply user overrides after building the subject-derived defaults, preserving TypeScript's required `name: string` typing without casts.
- `ConsumerModuleOptions`, `SyncJetStreamConsumerDepsOptions`, `SyncRequestReplyConsumerDepsOptions`, `JetStreamConsumerDeps`, `RequestReplyConsumerDeps`, and `EventsToolkitConsumerOptions` now expose an optional `streamConfig?: Partial<StreamConfig>` field.
- `ConsumerModule.forRoot`, `ConsumerModule.forRootAsync`, the sync and async consumer provider factories, and `EventsToolkitModule` (sync + async import builders) propagate `streamConfig` end-to-end to `StreamAutoCreator`.
- `JetStreamConsumerService` and `RequestReplyConsumerService` now forward `deps.streamConfig` and `deps.logger` into the `StreamAutoCreator` constructor when auto-creation is enabled.
- The four logger context interfaces (`EventLogContext`, `EventErrorLogContext`, `OutboxLogContext`, `OutboxErrorLogContext`) and `EventLoggerOptions` have been moved from `src/logging/event-logger.service.ts` into a new `src/logging/event-logger-context.interface.ts` to keep the service source file under the 200-line rule after adding the generic log methods.

### Tests

- Extended `stream-auto-creator.spec.ts` with a `with streamConfig overrides` block: default merge, user `max_bytes` wins, INFO log on overrides, no INFO log without overrides, ERROR log + rethrow on server rejection, no ERROR log on race-condition swallow.
- Extended `jetstream-consumer.service.auto-create.spec.ts` and `request-reply-consumer.service.auto-create.spec.ts` to verify `streamConfig` reaches `jetStreamManager.streams.add` and triggers INFO logging.
- Extended `consumer.module.auto-create.spec.ts` to verify `streamConfig` propagation through `forRoot` (JetStream + Request-Reply) and `forRootAsync`.

### Documentation

- `docs/nats-jetstream-configuration.md` gains a "Custom Stream Config Overrides" subsection under "Stream Auto-Creation" with a usage example and the rejection-logging guarantee.
```

---

## 5. Git Actions (per implementation sub-task 4.2)

> Per Agent responsibility: implementer sub-agent commits per logical unit. Suggested commit sequence for Task 1's implementation:

1. `refactor(logging): extract logger context interfaces into dedicated module` (Step 2.1 split-out interfaces)
2. `feat(logging): add generic logInfo / logError methods to EventLoggerService` (Step 2.1 method additions)
3. `feat(consumer): expose streamConfig override on consumer options interfaces` (Steps 2.2–2.5)
4. `feat(consumer): merge streamConfig overrides in StreamAutoCreator with INFO/ERROR logging` (Step 2.6)
5. `feat(consumer): forward streamConfig + logger to StreamAutoCreator from consumer services` (Step 2.7)
6. `feat(consumer): propagate streamConfig through consumer provider factories and ConsumerModule` (Steps 2.8–2.9)
7. `feat(events-toolkit): wire streamConfig through EventsToolkitModule sync and async paths` (Step 2.10)
8. `test(consumer): cover streamConfig overrides, propagation, and rejection logging` (Step 3.x tests)

Each commit must follow the [Gitignore Compliance Rule](../.kilo/rules/gitignore-compliance.md) and [Git Remote Safety Rule](../.kilo/rules/git-remote-safety.md) (push to `origin` only, no `base-project`/`upstream` pushes).

---

## 6. Verification (cross-check against the TODO file)

Mapping each TODO requirement to a plan step:

| TODO requirement | Plan step(s) |
|---|---|
| 1. Update `ConsumerModuleOptions` (consumer.maxBytes + others) | 2.3 (uses `Partial<StreamConfig>` for "all NATS options") |
| 2. Update `StreamAutoCreator` accept + include config in `streams.add()` | 2.6 |
| 3. Update provider factories (4 factories) | 2.8 (sync JS, sync RR, async JS, async RR) |
| 4. Update `ConsumerModule.forRoot` / `forRootAsync` | 2.9 (forRoot); async auto-covered by 2.8 factories |
| 5. Update `JetStreamConsumerService` + `RequestReplyConsumerService` | 2.7 |
| 6. Tests (unit + existing consumer tests) | 3.1–3.6 |
| 7. Make server rejections clear (auth/permissions/any error type) | 2.6 `logRejectedConfig` always logs when logger present |
| 8. INFO log when sending custom config to NATS | 2.6 `logCustomConfig` |
| 9. Update changelog | 4.2 (delegated to docs specialist sub-step) |
| 10. Define/update documentation with NATS config option details | 4.1 (delegated to docs specialist sub-step) |

Plan matches TODO and the global plan pre-analysis. No deviation.

---

## 7. Open Questions / Ambiguities

None. The TODO clearly states `Partial<StreamConfig>` is the intended override vehicle. The `logger` plumbing is implied by point 8 ("INFO log when sending to NATS") and point 7 ("make it clear if the NATS server blocks config options set").

---

## 8. Boundaries respected

This plan is purely a planning artifact. No source code was modified. The plan path conforms to `.kilo/rules/important-paths.md`: `.kilo/plans/<YYYYMMDD>-<plan-name>.md`.