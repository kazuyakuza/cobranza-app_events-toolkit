/**
 * @packageDocumentation
 * Public API for the events-toolkit — unified entry point re-exporting all modules.
 */

// ── Common ──
export * from './common';

// ── Logging ──
export * from './logging';

// ── Producer ──
export * from './producer';

// ── Consumer ──
export * from './consumer';

// ── Request-Reply ──
export * from './request-reply';

// ── Outbox ──
export * from './outbox';

// ── Discovery ──
export * from './discovery';

// ── Events Toolkit (Unified) ──
export { EventsToolkitModule } from './events-toolkit.module';
export {
  EventsToolkitModuleOptions,
  EventsToolkitModuleAsyncOptions,
  EventsToolkitNatsOptions,
  EventsToolkitOutboxOptions,
  EventsToolkitLoggingOptions,
  EventsToolkitConsumerOptions,
  EventsToolkitDiscoveryOptions,
} from './events-toolkit-options.interface';

// ── Testing ──
// Testing utilities are exposed via the `@cobranza-apps/events-toolkit/testing`
// subpath export (see package.json `exports`). Do NOT re-export them here:
// `src/testing/assertion.helpers.ts` and `src/testing/discovery-assertion.helpers.ts`
// import `@jest/globals`, which crashes any non-Jest consumer that loads the main entry.
