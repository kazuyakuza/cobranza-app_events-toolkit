# Simplification Plan — Task 2: Add end-to-end integration test for `EventsToolkitModule.forRootAsync`

Date: 20260713
TODO: `.agent/todos/20260713/20260713-todo-1.md` (section: "Add end-to-end integration test")
Implementation plan: `.kilo/plans/20260713-add-forRootAsync-e2e-test-task2.md`

## Simplification Verdict

**Proposed simplifications found.** Three low-risk cleanups are recommended:

1. Reduce duplicate `compileToolkitModule()` calls in the e2e spec by moving compilation into `beforeEach`.
2. Remove redundant `node_modules` and `dist` entries from `tsconfig.json` `exclude` (already outside the `src/**/*` include scope).
3. Remove the invalid top-level `description` field from `.github/workflows/npm-publish.yml`.

All proposed changes preserve behavior, keep the `NestDiscoveryModule` assertion, and keep the test independent of a real NATS server.

## 1. E2E Spec — Use `beforeEach` for Module Compilation

### Current Issue

Every test calls `moduleRef = await compileToolkitModule()` and the `afterEach` guard checks `if (moduleRef)`. This duplicates the same two lines five times.

### Proposed Change

Move `compileToolkitModule()` into a `beforeEach` block. Each test then only contains its focused assertion. Keep the `afterEach` cleanup with the guard in case `beforeEach` fails.

### File: `src/events-toolkit.module.e2e-spec.ts`

```ts
import 'reflect-metadata';
import { Test, TestingModule } from '@nestjs/testing';
import { EventsToolkitModule } from './events-toolkit.module';
import { EventsToolkitModuleAsyncOptions } from './events-toolkit-options.interface';
import { ProducerService } from './producer/producer.service';
import { ConsumerService } from './consumer/consumer.service';
import { OutboxService } from './outbox/outbox.service';
import { DiscoveryService } from './discovery/discovery.service';

jest.mock('nats', () => ({
  connect: jest.fn().mockResolvedValue({
    jetstream: jest.fn().mockReturnValue({
      publish: jest.fn(),
      subscribe: jest.fn(),
    }),
    close: jest.fn(),
  }),
}));

jest.mock('./outbox/sqlite-outbox.repository', () => ({
  SqliteOutboxRepository: jest.fn().mockImplementation(() => ({
    save: jest.fn(),
    getPending: jest.fn().mockResolvedValue([]),
    markAsSent: jest.fn(),
    markAsFailed: jest.fn(),
  })),
}));

function buildForRootAsyncOptions(): EventsToolkitModuleAsyncOptions {
  return {
    useFactory: async () => ({
      nats: { servers: ['nats://localhost:4222'] },
      consumer: { enable: true },
      outbox: { type: 'sqlite' as const },
      discovery: { enabled: true, registerOnStartup: false },
    }),
  };
}

async function compileToolkitModule(): Promise<TestingModule> {
  return Test.createTestingModule({
    imports: [EventsToolkitModule.forRootAsync(buildForRootAsyncOptions())],
  }).compile();
}

describe('EventsToolkitModule.forRootAsync e2e DI compilation', () => {
  let moduleRef: TestingModule;

  beforeEach(async () => {
    moduleRef = await compileToolkitModule();
  });

  afterEach(async () => {
    if (moduleRef) {
      await moduleRef.close();
    }
  });

  it('compiles the full toolkit graph without external core providers', () => {
    expect(moduleRef).toBeDefined();
  });

  it('resolves ProducerService from the compiled module', () => {
    expect(moduleRef.get(ProducerService)).toBeInstanceOf(ProducerService);
  });

  it('resolves ConsumerService from the compiled module', () => {
    expect(moduleRef.get(ConsumerService)).toBeInstanceOf(ConsumerService);
  });

  it('resolves OutboxService from the compiled module', () => {
    expect(moduleRef.get(OutboxService)).toBeInstanceOf(OutboxService);
  });

  it('resolves DiscoveryService via the fixed NestDiscoveryModule import', () => {
    expect(moduleRef.get(DiscoveryService)).toBeInstanceOf(DiscoveryService);
  });
});
```

### Behavior Notes

- Each test still gets a freshly compiled module because Jest runs `beforeEach`/`afterEach` around every `it`.
- The `NestDiscoveryModule` assertion is preserved unchanged.
- The `nats` and `sqlite-outbox.repository` mocks remain in place, so no real NATS server or SQLite file is touched.

## 2. `tsconfig.json` — Minimal Excludes

### Current Issue

`include` is already scoped to `src/**/*`. `node_modules` and `dist` sit outside `src`, so listing them in `exclude` is redundant. The only excludes that actually matter are the test-file patterns.

### Proposed Change

```json
{
  "exclude": [
    "**/*.spec.ts",
    "**/*.test.ts",
    "**/*.e2e-spec.ts"
  ]
}
```

### Behavior Notes

- `tsc` behavior is unchanged because the removed entries were never matched by `include`.
- The test-file patterns stay so `npm run build` does not ship tests in `dist/`.

## 3. `tsconfig.build.json` — No Action Required

This file already extends `tsconfig.json` and adds only the extra `**/__mocks__/**` and `**/*.e2e-spec.ts` exclusions needed for the production build. Once `tsconfig.json` is simplified, `tsconfig.build.json` inherits the minimal base and remains correct.

No change proposed.

## 4. CI Workflow — Remove Invalid `description` Field

### Current Issue

GitHub Actions workflow schema does not support a top-level `description` key. The field is silently ignored by GitHub but adds noise and may trigger schema-aware linters/IDE warnings.

### Proposed Change

Remove line 2 from `.github/workflows/npm-publish.yml`:

```yaml
name: Publish Package to NPM

on:
  push:
    branches:
      - main
```

### Behavior Notes

- Workflow trigger, jobs, and publish logic are unchanged.
- The package description already lives in `package.json` where it belongs.

## 5. Verification Steps

Run the same verification commands from the implementation plan after applying simplifications:

1. `npm run lint`
2. `npm run typecheck`
3. `npm run test` — confirm the e2e file is not executed.
4. `npm run test:e2e` — confirm all 5 e2e assertions pass and runtime remains < 5s.
5. `npm run build`
6. Confirm `dist/` contains no `*e2e-spec*` artifact.

## 6. Files Touched (summary)

| File | Action |
| --- | --- |
| `src/events-toolkit.module.e2e-spec.ts` | edit: move `compileToolkitModule()` into `beforeEach` |
| `tsconfig.json` | edit: remove redundant `node_modules`/`dist` excludes |
| `.github/workflows/npm-publish.yml` | edit: remove invalid top-level `description` |
| `tsconfig.build.json` | no change |

## 7. Out of Scope (NOT changed)

- No implementation code edits.
- No removal of the `NestDiscoveryModule` test assertion.
- No change to mocking strategy or real NATS server dependency.
- No new files, no dependency changes, no version bump.
- No git operations (commit/push/merge) performed in this simplification step.
