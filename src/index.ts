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

// ── Idempotency ──
export * from './idempotency';

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
  EventsToolkitIdempotencyOptions,
} from './events-toolkit-options.interface';

// ── Testing ──
//
// Testing utilities are intentionally NOT re-exported from this barrel.
// They are exposed via the `@cobranza-apps/events-toolkit/testing` subpath
// export (see `package.json` `exports` map).
//
// Reason: `src/testing/assertion.helpers.ts` and
// `src/testing/discovery-assertion.helpers.ts` import `@jest/globals`,
// which throws "Do not import `@jest/globals` outside of the Jest test
// environment" when the main entry is loaded in a non-Jest process
// (e.g. NestJS CLI scripts, seeders, Jest globalSetup).
//
// Consumers should import testing symbols from:
//   import { MockProducerService } from '@cobranza-apps/events-toolkit/testing';
