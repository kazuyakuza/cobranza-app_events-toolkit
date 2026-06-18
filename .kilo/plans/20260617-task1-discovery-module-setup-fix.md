# Task 1 Discovery Module Setup — Fix Plan

## Issues Found

1. **Critical** — `src/events-toolkit.module.ts:218`
   `buildDiscoveryAsyncImport()` calls `DiscoveryModule.forRoot({})`, discarding user-provided `discovery` options resolved by `EventsToolkitModuleAsyncOptions`. Discovery runs with defaults in async mode.

2. **Critical** — `src/events-toolkit.module.ts:218`
   `buildDiscoveryAsyncImport()` always imports `DiscoveryModule`. Unlike sync `forRoot`, it cannot respect `options.discovery.enabled !== false` because options are resolved at runtime, so discovery is effectively forced on with default settings.

3. **Medium** — `src/discovery/discovery.module.ts:33`
   The `return` object in `DiscoveryModule.forRoot` nests array elements at the 3rd indentation level, violating the max 2 indentation levels rule.

4. **Medium** — `src/discovery/discovery.service.ts:9`
   `DiscoveryService` injects `EventLoggerService`, but `DiscoveryModule` does not provide or export it. Standalone use of `DiscoveryModule` fails at runtime; it currently works only because `EventsToolkitModule` is global.

## Proposed Fixes

### Fix 1 — Propagate discovery options in async mode

- Add `DiscoveryModule.forRootAsync(asyncOptions)` in `src/discovery/discovery.module.ts`.
- Define a `DiscoveryModuleAsyncOptions` interface with `imports`, `useFactory`, and `inject`.
- Implement the async method so it builds a `DISCOVERY_MODULE_OPTIONS` provider from the factory.
- Update `buildDiscoveryAsyncImport()` in `src/events-toolkit.module.ts` to call `DiscoveryModule.forRootAsync` with a factory that reads `EVENTS_TOOLKIT_OPTIONS` and passes `opts.discovery ?? {}`.

### Fix 2 — Respect the `enabled` flag in async mode

- Add `enabled: boolean` to `DiscoveryModuleOptions` in `src/discovery/discovery.module.ts`.
- Update `resolveDiscoveryOptions` to default `enabled` to `true`.
- Update `DiscoveryService` to skip all lifecycle logic when `resolvedOptions.enabled === false`.
- After this, `EventsToolkitModule` can safely import `DiscoveryModule` in async mode; the service itself will remain idle when disabled.

### Fix 3 — Reduce indentation in `DiscoveryModule.forRoot`

- Extract the `providers` and `exports` arrays into local constants before the `return` statement in `DiscoveryModule.forRoot` so no array/object literal exceeds 2 indentation levels.

### Fix 4 — Make logger dependency robust

- Mark `EventLoggerService` as `@Optional()` in `DiscoveryService`.
- Provide a fallback `new EventLoggerService()` when the logger is not available, so `DiscoveryModule` can be used standalone.

## Verification Steps

1. Run `npm run typecheck` and ensure no TypeScript errors.
2. Run `npm run lint` and ensure no lint errors.
3. Add/update unit tests for:
   - `DiscoveryModule.forRoot` with custom options.
   - `DiscoveryModule.forRootAsync` resolving custom options.
   - `DiscoveryService` skipping startup when `enabled` is `false`.
   - `DiscoveryService` running startup when `enabled` defaults to `true`.
   - `EventsToolkitModule.forRootAsync` passing discovery options to the discovery subsystem.
4. Confirm file line counts remain under 200 and method bodies remain under 50 lines.
5. Confirm no commented-out code remains in modified files.
