# Task 7: Main Barrel Fix Plan

## File

- `src/index.ts`

## Issues Found

### 1. Missing Consumer Public API Exports

The barrel does not re-export several public types and utilities that are part of the exported consumer API surface.

| Export | Source | Reason it is public |
|--------|--------|---------------------|
| `SubscribeOptions` | `src/consumer/subscribe-options.interface.ts` | Parameter type of public `JetStreamConsumerService.subscribe()` |
| `ConsumerSubscribeOpts` | `src/consumer/subscribe-options.interface.ts` | Field type within `SubscribeOptions` |
| `DispatchOptions` | `src/consumer/dispatch-options.interface.ts` | Parameter type of public `ConsumerService.dispatch()` |
| `JetStreamConsumerDeps` | `src/consumer/jetstream-consumer-deps.interface.ts` | Dependency interface of exported `JetStreamConsumerService` |
| `JETSTREAM_CONSUMER_DEPS_TOKEN` | `src/consumer/jetstream-consumer-deps.interface.ts` | Injection token paired with `JetStreamConsumerDeps` |
| `defaultDlqSubjectBuilder` | `src/consumer/subscribe-options.interface.ts` | Default DLQ builder referenced by `ConsumerModuleOptions`; useful public utility |
| `envelopeToContext` | `src/consumer/subscribe-options.interface.ts` | Public utility to derive `EventContext` from an `EventEnvelope` |

This is inconsistent with other exported services (e.g. `RequestReplyDeps` and `REQUEST_REPLY_DEPS_TOKEN` are already exported for `RequestReplyService`).

### 2. Style Consistency — Minor

The existing barrel is well organized with section comments. After adding the missing exports, keep the same `// ── Consumer ──` section and formatting style (multi-line export blocks with trailing commas).

## Fix

Add the missing exports under the `// ── Consumer ──` section in `src/index.ts`:

```ts
// ── Consumer ──
export { ConsumerService, EventHandler } from './consumer/consumer.service';
export { JetStreamConsumerService } from './consumer/jetstream-consumer.service';
export {
  ConsumerModule,
  CONSUMER_MODULE_OPTIONS,
  ConsumerModuleOptions,
  ConsumerModuleAsyncOptions,
} from './consumer/consumer.module';
export { OnEvent, ON_EVENT_METADATA, OnEventOptions } from './consumer/decorators/on-event.decorator';
export { OnEventExplorer } from './consumer/decorators/on-event.explorer';
export {
  ON_EVENT_EXPLORER_DEPS_TOKEN,
  OnEventExplorerDeps,
} from './consumer/decorators/on-event-explorer-deps.interface';
export { DispatchOptions } from './consumer/dispatch-options.interface';
export {
  SubscribeOptions,
  ConsumerSubscribeOpts,
  defaultDlqSubjectBuilder,
  envelopeToContext,
} from './consumer/subscribe-options.interface';
export {
  JetStreamConsumerDeps,
  JETSTREAM_CONSUMER_DEPS_TOKEN,
} from './consumer/jetstream-consumer-deps.interface';
```

## Verification

1. Run `npm run typecheck` to confirm no compilation errors.
2. Run `npm run lint` to confirm no lint/style regressions.
3. Optionally run `npm test` to ensure no test breakage.

## Not in Scope

- Do not export internal types such as `DiscoveryReflectorPair`, `ConsumerServicesPair`, `ResolvedConnection`, `EmissionInput`, `EmitEventInput`, `HandlerTarget`, `ValidationErrorOptions`, `ErrorHandlingOptions`, or `DlqRoutingOptions`.
- No changes to source files other than `src/index.ts`.
