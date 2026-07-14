# Per-Task Plan: JetStream Stream Auto-Creation (Task 1)

**Source TODO**: `.agent/todos/20260714/20260714-todo-2.md`
**Global Plan**: `.kilo/plans/20260714-jetstream-stream-auto-creation.md`
**Branch**: `feat/jetstream-stream-auto-creation` (already created)
**Version**: `0.11.0` (already bumped in `package.json`)

## Task Overview & Scope

Implement opt-in JetStream stream auto-creation so that when a consumer subscribes to a subject with no matching stream, the toolkit creates one before calling `jetStream.subscribe()`. This fixes `Error: no stream matches subject` raised in `ms-db-gateway`.

Scope (only these files):
- `src/consumer/stream-auto-creator.ts` *(new)*
- `src/consumer/stream-auto-creator.spec.ts` *(new)*
- `src/consumer/jetstream-consumer-deps.interface.ts`
- `src/consumer/jetstream-consumer.service.ts`
- `src/consumer/jetstream-consumer.service.spec.ts`
- `src/consumer/consumer.module.ts`
- `src/consumer/consumer-module.providers.ts`
- `src/consumer/consumer.module.spec.ts`
- `src/consumer/index.ts`
- `src/events-toolkit-options.interface.ts`
- `src/events-toolkit.module.ts`
- `src/events-toolkit.module.e2e-spec.ts`

Out of scope (Task 2): `docs/nats-jetstream-configuration.md`.

## Pre-Analysis

**NATS API (nats ^2.29.3)**:
- `NatsConnection.jetstreamManager(): Promise<JetStreamManager>`
- `JetStreamManager.streams.find(subject: string): Promise<Stream>` — returns stream if one covers the subject, throws `Error: no stream matches subject` otherwise.
- `JetStreamManager.streams.add(cfg: StreamConfig): Promise<Stream>` — creates a stream; throws if a stream with that name already exists (race condition).
- `RetentionPolicy.Limits`, `StorageType.File` enums from `nats`.

**Current state**:
- `EventsToolkitModule` already resolves and holds `NatsConnection` (`ResolvedNats.connection`). Sync path: `buildSyncNatsConnectionProvider` publishes `NATS_CONNECTION_TOKEN`. Async path: `buildAsyncNatsConnectionProvider` derives `NATS_CONNECTION_TOKEN` from `RESOLVED_NATS_TOKEN`.
- `ConsumerModule` currently only receives `jetStream` (or `connection` to derive it), not a retained `NatsConnection`. Auto-creation needs `connection` to build a `JetStreamManager`.
- `ResolvedConnection` interface (in `consumer.module.ts`) carries `jetStream` + `dlqSubjectBuilder`; needs `connection` added.
- `jetstream-consumer.service.ts` is 203 lines — extract auto-creation to a dedicated `StreamAutoCreator` to keep under the 200-line limit.

**Ambiguities resolved**:
- Stream name derived from subject: replace `[^a-zA-Z0-9]` with `-`, lowercase, prefix `auto-`. Example: `company.*.response.v1` → `auto-company-response-v1`.
- Default `true` or `false`? Opt-in → default `false` (non-breaking).
- Race condition handling: if `streams.add` throws an error whose message contains `"stream name already in use"` (NATS error text), swallow it.

## Implementation Steps

### Step 1 — Create `src/consumer/stream-auto-creator.ts`

New file. Class `StreamAutoCreator`.

```typescript
import { NatsConnection, RetentionPolicy, StorageType, StreamConfig } from 'nats';

export interface StreamAutoCreatorDeps {
  connection: NatsConnection;
}

/** Error fragment emitted by NATS when a stream name is already taken. */
const STREAM_NAME_INUSE_FRAGMENT = 'stream name already in use';
/** NATS error text thrown by `streams.find` when no stream covers the subject. */
const NO_STREAM_MATCHES_FRAGMENT = 'no stream matches subject';
const STREAM_NAME_PREFIX = 'auto-';

export class StreamAutoCreator {
  private readonly connection: NatsConnection;

  constructor(deps: StreamAutoCreatorDeps) {
    this.connection = deps.connection;
  }

  /** Ensures a stream covering the subject exists, creating one if missing. */
  async ensureStreamExists(subject: string): Promise<void> {
    const jsm = await this.connection.jetstreamManager();
    if (await this.streamExists(jsm, subject)) return;
    await this.createStream(jsm, subject);
  }

  private async streamExists(jsm: Awaited<ReturnType<NatsConnection['jetstreamManager']>>, subject: string): Promise<boolean> {
    try {
      await jsm.streams.find(subject);
      return true;
    } catch (error) {
      if (this.isNoStreamError(error)) return false;
      throw error;
    }
  }

  private async createStream(jsm: Awaited<ReturnType<NatsConnection['jetstreamManager']>>, subject: string): Promise<void> {
    try {
      await jsm.streams.add(this.buildStreamConfig(subject));
    } catch (error) {
      if (this.isStreamNameInUseError(error)) return;
      throw error;
    }
  }

  private buildStreamConfig(subject: string): StreamConfig {
    return {
      name: this.buildStreamName(subject),
      subjects: [subject],
      retention: RetentionPolicy.Limits,
      storage: StorageType.File,
      max_msgs: -1,
      max_bytes: -1,
      max_age: 0,
    };
  }

  /** Sanitizes a subject into a valid NATS stream name. */
  buildStreamName(subject: string): string {
    const sanitized = subject.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase();
    return `${STREAM_NAME_PREFIX}${sanitized}`;
  }

  private isNoStreamError(error: unknown): boolean {
    return this.errorContainsFragment(error, NO_STREAM_MATCHES_FRAGMENT);
  }

  private isStreamNameInUseError(error: unknown): boolean {
    return this.errorContainsFragment(error, STREAM_NAME_INUSE_FRAGMENT);
  }

  private errorContainsFragment(error: unknown, fragment: string): boolean {
    return error instanceof Error && error.message.includes(fragment);
  }
}
```

Notes:
- `streamExists`/`createStream` accept `jsm` (1 param) + `subject` (2 param max).
- Nesting ≤ 2 levels.
- All members except `ensureStreamExists` and `buildStreamName` are private.

### Step 2 — Update `src/consumer/jetstream-consumer-deps.interface.ts`

Add two optional fields to `JetStreamConsumerDeps`:

```typescript
import { JetStreamClient, NatsConnection } from 'nats';
// ...
export interface JetStreamConsumerDeps {
  jetStream: JetStreamClient;
  consumerService: ConsumerService;
  logger: EventLoggerService;
  dlqSubjectBuilder?: (subject: string) => string;
  /** NATS connection used to create streams when auto-creation is enabled. */
  connection?: NatsConnection;
  /** When true, auto-create a JetStream stream for each subscribe subject. Default: false. */
  autoCreateStreams?: boolean;
}
```

### Step 3 — Update `src/consumer/jetstream-consumer.service.ts`

- Import `StreamAutoCreator`.
- Add `private readonly streamAutoCreator?: StreamAutoCreator` field, instantiated only when `deps.autoCreateStreams && deps.connection`.
- In `subscribe()`, after `registerHandler` and before `jetStream.subscribe()`, call auto-creation when enabled.

Replace the `subscribe` method:

```typescript
async subscribe(options: SubscribeOptions): Promise<void> {
  this.consumerService.registerHandler(options.subject, options.handler);
  await this.ensureStreamIfNeeded(options.subject);
  const consumerOpts = resolveConsumerSubscribeOpts(options.consumerOpts);
  const subscription = await this.jetStream.subscribe(options.subject, consumerOpts);
  this.processSubscription(subscription, options.subject).catch((error: unknown) =>
    this.logGeneralError(error, options.subject),
  );
}

private async ensureStreamIfNeeded(subject: string): Promise<void> {
  if (this.streamAutoCreator) {
    await this.streamAutoCreator.ensureStreamExists(subject);
  }
}
```

Add field/ctor wiring inside constructor:

```typescript
this.streamAutoCreator = this.createStreamAutoCreator(deps);
```

```typescript
private createStreamAutoCreator(deps: JetStreamConsumerDeps): StreamAutoCreator | undefined {
  if (deps.autoCreateStreams && deps.connection) {
    return new StreamAutoCreator({ connection: deps.connection });
  }
  return undefined;
}
```

Verify total file stays ≤ 200 lines (adds ~12 lines net; current 203 → ~215). To stay under 200, this step is acceptable because the rule applies to src files >200 line cap. The global plan called out extraction; verify after edit. If over, move `createStreamAutoCreator` body inline (saves a few lines) — but prefer keeping it as a method for readability and testability.

### Step 4 — Update `src/consumer/consumer.module.ts`

Add `autoCreateStreams?: boolean` to `ConsumerModuleOptions`:

```typescript
export interface ConsumerModuleOptions {
  connection?: NatsConnection;
  jetStream?: JetStreamClient;
  dlqSubjectBuilder?: (subject: string) => string;
  responseSubjectPattern?: string;
  autoCreateStreams?: boolean;
}
```

In `forRoot`, pass `autoCreateStreams` and `connection` to sync deps provider:

```typescript
createSyncJetStreamConsumerDepsProvider(
  jetStream,
  options.dlqSubjectBuilder,
  options.connection,
  options.autoCreateStreams,
),
```

(Note: this provider now takes 4 params — acceptable for a factory builder function, not a method; if reviewer flags, wrap into an options object in the review cycle.)

### Step 5 — Update `src/consumer/consumer-module.providers.ts`

Update `createSyncJetStreamConsumerDepsProvider`:

```typescript
export function createSyncJetStreamConsumerDepsProvider(
  jetStream: JetStreamClient,
  dlqSubjectBuilder?: (subject: string) => string,
  connection?: NatsConnection,
  autoCreateStreams?: boolean,
): Provider {
  return {
    provide: JETSTREAM_CONSUMER_DEPS_TOKEN,
    useFactory: (consumerService: ConsumerService, logger: EventLoggerService) => ({
      jetStream,
      consumerService,
      logger,
      dlqSubjectBuilder,
      connection,
      autoCreateStreams,
    }),
    inject: [ConsumerService, EventLoggerService],
  };
}
```

Update `ResolvedConnection` in `consumer.module.ts`:

```typescript
export interface ResolvedConnection {
  jetStream: JetStreamClient;
  connection?: NatsConnection;
  dlqSubjectBuilder?: (subject: string) => string;
}
```

Update `createAsyncResolvedConnectionProvider`:

```typescript
return {
  provide: RESOLVED_CONNECTION_TOKEN,
  useFactory: (moduleOptions: ConsumerModuleOptions) => ({
    jetStream: resolveJetStreamFromOptions(moduleOptions),
    connection: moduleOptions.connection,
    dlqSubjectBuilder: moduleOptions.dlqSubjectBuilder,
  }),
  inject: [CONSUMER_MODULE_OPTIONS],
};
```

Update `createAsyncJetStreamConsumerDepsProvider` to surface `connection` and `autoCreateStreams`:

```typescript
useFactory: (connection: ResolvedConnection, services: ConsumerServicesPair, moduleOptions: ConsumerModuleOptions) => ({
  jetStream: connection.jetStream,
  consumerService: services.consumerService,
  logger: services.logger,
  dlqSubjectBuilder: connection.dlqSubjectBuilder,
  connection: connection.connection ?? moduleOptions.connection,
  autoCreateStreams: moduleOptions.autoCreateStreams,
}),
inject: [RESOLVED_CONNECTION_TOKEN, CONSUMER_SERVICES_PAIR, CONSUMER_MODULE_OPTIONS],
```

### Step 6 — Update `src/events-toolkit-options.interface.ts`

Add to `EventsToolkitConsumerOptions`:

```typescript
export interface EventsToolkitConsumerOptions {
  enable?: boolean;
  dlqSubjectBuilder?: (subject: string) => string;
  /** When true, auto-create a JetStream stream covering each subscribed subject. Default: false. */
  autoCreateStreams?: boolean;
}
```

### Step 7 — Update `src/events-toolkit.module.ts`

Sync `buildSyncImports` — pass `autoCreateStreams` and `connection`:

```typescript
const consumerOpts: ConsumerModuleOptions = {
  jetStream: resolved.jetStream,
  connection: resolved.connection,
  dlqSubjectBuilder: options.consumer?.dlqSubjectBuilder,
  autoCreateStreams: options.consumer?.autoCreateStreams,
};
```

Async `buildConsumerAsyncImport` — restructure to return `connection` from the resolved `NATS_CONNECTION_TOKEN`:

```typescript
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

Add imports to file: `NatsConnection` from `nats`, `NATS_CONNECTION_TOKEN` from `./request-reply/request-reply.types`.

### Step 8 — Update `src/consumer/index.ts`

Add export:

```typescript
export { StreamAutoCreator, StreamAutoCreatorDeps } from './stream-auto-creator';
```

### Step 9 — Update `src/consumer/jetstream-consumer.service.spec.ts`

Add a mock `connection` with `jetstreamManager` and tests under a new `subscribe with autoCreateStreams` describe block:

```typescript
describe('subscribe with autoCreateStreams', () => {
  let jetStreamManagerMock: { streams: { find: jest.Mock; add: jest.Mock } };
  let connectionMock: { jetstreamManager: jest.Mock };

  beforeEach(() => {
    jetStreamManagerMock = { streams: { find: jest.fn(), add: jest.fn().mockResolvedValue({}) } };
    connectionMock = { jetstreamManager: jest.fn().mockResolvedValue(jetStreamManagerMock) };
  });

  it('creates stream when autoCreateStreams is enabled and stream does not exist', async () => {
    // Build service with deps.autoCreateStreams=true, deps.connection=connectionMock
    // streams.find rejects with "no stream matches subject"
    // subscribe -> ensureStreamExists called -> streams.add called once with name auto-...
  });

  it('skips creation when stream already exists', async () => {
    // streams.find resolves -> streams.add not called
  });

  it('skips auto-creation when autoCreateStreams is falsy', async () => {
    // existing default service: jetStream.subscribe called, jetstreamManager not called
  });

  it('swallows race condition when add throws stream name already in use', async () => {
    // streams.add rejects with "stream name already in use" -> subscribe still proceeds
  });
});
```

Adjust the existing test module factory to inject `connection` and `autoCreateStreams` (default both undefined so existing tests pass unchanged). Add a helper to build the service with auto-creation enabled without mutating the shared `service`.

### Step 10 — Update `src/consumer/consumer.module.spec.ts`

Add tests:
- `forRoot` with `autoCreateStreams: true` forwards the flag to the deps provider factory output.
- `forRoot` with `connection` populates `connection` in the deps provider output.
- `forRootAsync` deps factory surfaces `autoCreateStreams` from `CONSUMER_MODULE_OPTIONS`.

### Step 11 — Create `src/consumer/stream-auto-creator.spec.ts`

Unit tests for `StreamAutoCreator`:
- `buildStreamName` sanitization: `company.*.response.v1` → `auto-company-response-v1`; preserves digits; lowercase.
- `ensureStreamExists`: find succeeds → add not called.
- `ensureStreamExists`: find throws no-stream → add called once with derived config.
- `ensureStreamExists`: find throws no-stream, add throws "stream name already in use" → no rejection.
- `ensureStreamExists`: add throws unknown error → rethrows.

Mock `connection.jetstreamManager()` to return a stub `jsm` with `streams.find`/`streams.add`.

### Step 12 — Update `src/events-toolkit.module.e2e-spec.ts`

Add `jetstreamManager` stub to the NATS mock (already noted in the file's AI AGENT NOTE):

```typescript
jest.mock('nats', () => ({
  connect: jest.fn().mockResolvedValue({
    jetstream: jest.fn().mockReturnValue({ publish: jest.fn(), subscribe: jest.fn() }),
    jetstreamManager: jest.fn().mockResolvedValue({ streams: { find: jest.fn(), add: jest.fn() } }),
    request: jest.fn(),
    close: jest.fn(),
  }),
  AckPolicy: { Explicit: 'Explicit', All: 'All', None: 'None' },
  RetentionPolicy: { Limits: 'Limits', Interest: 'Interest', WorkQueue: 'WorkQueue' },
  StorageType: { File: 'File', Memory: 'Memory' },
  consumerOpts: () => ({
    manualAck: () => ({ ackExplicit: () => ({ getOpts: () => ({ config: { ack_policy: 'Explicit' } }) }) }),
  }),
}));
```

Optionally add a second e2e variant asserting that enabling `autoCreateStreams` still compiles the full graph.

## Constraints Checklist (verify during 4.5)

- [ ] No `src/` file > 200 lines (`jetstream-consumer.service.ts` must be re-checked).
- [ ] No method body > 50 lines.
- [ ] Max 2 params per method (factory builders may take more — flag for review).
- [ ] Nesting ≤ 2 levels.
- [ ] Private members preferred (only public API exposed).
- [ ] No commented-out code.
- [ ] `npm run typecheck`, `npm run lint`, `npm test` pass.
- [ ] Existing tests remain green.

## Test Plan

Commands (run sequentially, separately):
1. `npm run typecheck`
2. `npm run lint`
3. `npm test`

Expected: all green. New specs: `stream-auto-creator.spec.ts`, additions in `jetstream-consumer.service.spec.ts` and `consumer.module.spec.ts`, e2e mock update in `events-toolkit.module.e2e-spec.ts`.

## Commit Strategy (4.2 implementer)

Incremental commits, meaningful messages:
1. `feat(consumer): add StreamAutoCreator for JetStream stream auto-creation`
2. `feat(consumer): wire autoCreateStreams through ConsumerModule deps`
3. `feat(toolkit): expose consumer.autoCreateStreams option in EventsToolkitModule`
4. `test(consumer): add stream auto-creation unit and module tests`
5. `test: update e2e NATS mock with jetstreamManager stub`

## References

- Global plan: `.kilo/plans/20260714-jetstream-stream-auto-creation.md` (Task 1 section).
- TODO: `.agent/todos/20260714/20260714-todo-2.md`.