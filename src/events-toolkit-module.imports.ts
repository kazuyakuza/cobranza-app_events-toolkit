import { DynamicModule } from '@nestjs/common';
import { JetStreamClient, NatsConnection } from 'nats';
import { JETSTREAM_TOKEN } from './producer/producer.constants';
import { ConsumerModule, ConsumerModuleOptions } from './consumer/consumer.module';
import { OutboxModule } from './outbox/outbox.module';
import { OutboxModuleOptions } from './outbox/outbox.types';
import { IdempotencyModule } from './idempotency/idempotency.module';
import { IdempotencyModuleOptions } from './idempotency/idempotency.types';
import { DiscoveryModule } from './discovery/discovery.module';
import { EVENTS_TOOLKIT_OPTIONS } from './events-toolkit-module.tokens';
import { NATS_CONNECTION_TOKEN } from './request-reply/request-reply.types';
import { buildIdempotencyModuleOptions, buildOutboxModuleOptions } from './events-toolkit-module.providers';
import type { EventsToolkitModuleOptions, EventsToolkitIdempotencyOptions } from './events-toolkit-options.interface';
import type { EventsToolkitDiscoveryOptions } from './discovery/discovery-service-options.interface';

/**
 * Returns `true` when the idempotency config is present and not explicitly disabled.
 * Used in the synchronous `forRoot` path to decide whether to import `IdempotencyModule`.
 *
 * @see {@link isIdempotencyDisabled} for the inverse check used in the async path.
 */
export function isIdempotencyEnabled(
  idempotency?: EventsToolkitIdempotencyOptions,
): idempotency is EventsToolkitIdempotencyOptions {
  return !!idempotency && idempotency.enabled !== false;
}

/**
 * Returns `true` when the idempotency config is absent or explicitly disabled.
 * Used in the asynchronous `forRootAsync` path where a default memory backend
 * is wired as a safe fallback because conditional module imports cannot be
 * decided at module-build time.
 *
 * @see {@link isIdempotencyEnabled} for the inverse check used in the sync path.
 */
export function isIdempotencyDisabled(idempotency?: EventsToolkitIdempotencyOptions): boolean {
  return idempotency === undefined || idempotency.enabled === false;
}

/**
 * Builds the async `ConsumerModule` import for the `forRootAsync` path.
 *
 * @see {@link ConsumerModule.forRootAsync} for the underlying module registration.
 */
export function buildConsumerAsyncImport(): DynamicModule {
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
        streamConfig: opts.consumer?.streamConfig,
        moduleConsumerOpts: opts.consumer,
      };
    },
    inject: [JETSTREAM_TOKEN, EVENTS_TOOLKIT_OPTIONS, NATS_CONNECTION_TOKEN],
  });
}

export function buildOutboxAsyncImport(): DynamicModule {
  return OutboxModule.forRootAsync({
    useFactory: async (...args: unknown[]): Promise<OutboxModuleOptions> => {
      const opts = args[0] as EventsToolkitModuleOptions;
      const outbox = opts.outbox ?? { type: 'sqlite' as const, sqlitePath: ':memory:' };
      return buildOutboxModuleOptions(outbox);
    },
    inject: [EVENTS_TOOLKIT_OPTIONS],
  });
}

/**
 * Builds the async `IdempotencyModule` import for the `forRootAsync` path.
 *
 * Async imports cannot be conditionally skipped at module-build time, so when
 * idempotency is disabled the factory falls back to a memory backend — consistent
 * with the outbox async pattern (see {@link buildOutboxAsyncImport}).
 *
 * @see {@link isIdempotencyDisabled} for the check that triggers the memory fallback.
 * @see {@link IdempotencyModule} for the underlying module.
 */
export function buildIdempotencyAsyncImport(): DynamicModule {
  return IdempotencyModule.forRootAsync({
    useFactory: async (...args: unknown[]): Promise<IdempotencyModuleOptions> => {
      const opts = args[0] as EventsToolkitModuleOptions;
      if (isIdempotencyDisabled(opts.idempotency)) {
        return { type: 'memory' };
      }
      return buildIdempotencyModuleOptions(opts.idempotency!);
    },
    inject: [EVENTS_TOOLKIT_OPTIONS],
  });
}

/**
 * Resolves the list of toolkit-level capabilities to advertise in the service manifest.
 *
 * Inspects the toolkit module options to determine which subsystems are enabled:
 * - `'idempotency'` — added when {@link isIdempotencyEnabled} returns `true`.
 * - `'outbox'` — added when `options.outbox` is defined.
 * - Any user-supplied capabilities from `options.discovery.capabilities` are appended.
 *
 * The resulting array is passed to `DiscoveryModule` via
 * {@link buildDiscoveryOptions} (sync path) or {@link buildDiscoveryAsyncImport} (async path)
 * and ultimately appears in the `capabilities` field of the `ServiceManifestDto`.
 *
 * @param options - The full toolkit module options.
 * @returns An array of capability strings (e.g. `['idempotency', 'outbox']`).
 *
 * @see {@link ServiceManifestDto.capabilities} for where the result is consumed.
 *
 * @example
 * ```ts
 * const caps = resolveCapabilities({ idempotency: { type: 'postgres' }, outbox: { type: 'sqlite' } });
 * // caps => ['idempotency', 'outbox']
 * ```
 */
export function resolveCapabilities(options: EventsToolkitModuleOptions): string[] {
  const capabilities: string[] = [];
  if (isIdempotencyEnabled(options.idempotency)) capabilities.push('idempotency');
  if (options.outbox) capabilities.push('outbox');
  return [...capabilities, ...(options.discovery?.capabilities ?? [])];
}

/**
 * Builds the async `DiscoveryModule` import for the `forRootAsync` path.
 *
 * Merges user-supplied discovery options with capabilities resolved via
 * {@link resolveCapabilities}, mirroring the sync path in
 * {@link buildDiscoveryOptions | EventsToolkitModule.buildDiscoveryOptions}.
 *
 * @see {@link resolveCapabilities} for how the capabilities list is computed.
 */
export function buildDiscoveryAsyncImport(): DynamicModule {
  return DiscoveryModule.forRootAsync({
    useFactory: (...args: unknown[]) => {
      const opts = args[0] as EventsToolkitModuleOptions;
      return {
        ...opts.discovery,
        capabilities: resolveCapabilities(opts),
      } satisfies EventsToolkitDiscoveryOptions;
    },
    inject: [EVENTS_TOOLKIT_OPTIONS],
  });
}
