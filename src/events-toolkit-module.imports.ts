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
 * Returns true when the idempotency config is present and not explicitly disabled.
 * Used in the synchronous forRoot path.
 */
export function isIdempotencyEnabled(
  idempotency?: EventsToolkitIdempotencyOptions,
): idempotency is EventsToolkitIdempotencyOptions {
  return !!idempotency && idempotency.enabled !== false;
}

/**
 * Returns true when the idempotency config is absent or explicitly disabled.
 * Used in the asynchronous forRootAsync path where a default memory backend
 * is wired as a safe fallback because conditional module imports cannot be
 * decided at module-build time.
 */
export function isIdempotencyDisabled(idempotency?: EventsToolkitIdempotencyOptions): boolean {
  return idempotency === undefined || idempotency.enabled === false;
}

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

export function buildIdempotencyAsyncImport(): DynamicModule {
  // Async imports cannot be conditionally skipped at module-build time, so the
  // fallback to a memory backend is a safe default — consistent with the outbox
  // async pattern (see {@link buildOutboxAsyncImport}).
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

export function resolveCapabilities(options: EventsToolkitModuleOptions): string[] {
  const capabilities: string[] = [];
  if (isIdempotencyEnabled(options.idempotency)) capabilities.push('idempotency');
  if (options.outbox) capabilities.push('outbox');
  return [...capabilities, ...(options.discovery?.capabilities ?? [])];
}

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
