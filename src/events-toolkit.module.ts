import { DynamicModule, ForwardReference, Module, OnModuleDestroy, Provider, Type } from '@nestjs/common';
import { ProducerModule } from './producer/producer.module';
import { JETSTREAM_TOKEN } from './producer/producer.constants';
import { ConsumerModule, ConsumerModuleOptions } from './consumer/consumer.module';
import { OutboxModule } from './outbox/outbox.module';
import { IdempotencyModule } from './idempotency/idempotency.module';
import { EventLoggerService } from './logging/event-logger.service';
import { DiscoveryModule } from './discovery/discovery.module';
import { RequestReplyService } from './request-reply/request-reply.service';
import { REQUEST_REPLY_DEPS_TOKEN } from './request-reply/request-reply.types';
import { EVENTS_TOOLKIT_OPTIONS, ResolvedNats } from './events-toolkit-module.tokens';
import { NATS_CONNECTION_TOKEN } from './request-reply/request-reply.types';
import {
  resolveConnection,
  buildOutboxModuleOptions,
  buildIdempotencyModuleOptions,
  setOwnedNatsConnection,
  closeOwnedNatsConnection,
  buildLoggingProvider,
  buildSyncNatsConnectionProvider,
  buildSyncRequestReplyDepsProvider,
  buildAsyncOptionsProvider,
  buildAsyncResolvedNatsProvider,
  buildAsyncJetStreamProvider,
  buildAsyncNatsConnectionProvider,
  buildAsyncLoggingProvider,
  buildAsyncRequestReplyDepsProvider,
} from './events-toolkit-module.providers';
import {
  buildConsumerAsyncImport,
  buildOutboxAsyncImport,
  buildIdempotencyAsyncImport,
  buildDiscoveryAsyncImport,
  isIdempotencyEnabled,
} from './events-toolkit-module.imports';
import { EventsToolkitModuleOptions, EventsToolkitModuleAsyncOptions } from './events-toolkit-options.interface';
import type { EventsToolkitDiscoveryOptions } from './discovery/discovery-service-options.interface';

type ModuleImport = Type<unknown> | DynamicModule | Promise<DynamicModule> | ForwardReference<unknown>;

/**
 * Root module that wires together Producer, Consumer, Outbox, Request-Reply, and Logging
 * subsystems into a single global NestJS dynamic module.
 */
@Module({})
export class EventsToolkitModule implements OnModuleDestroy {
  /**
   * Registers the toolkit with synchronous, fully-resolved options.
   * Creates or reuses a NATS connection, conditionally imports Consumer/Outbox/Discovery,
   * and registers+exports RequestReplyService and REQUEST_REPLY_DEPS_TOKEN so that
   * any module importing EventsToolkitModule can inject RequestReplyService directly.
   *
   * @param options - Fully-resolved toolkit configuration (NATS, outbox, logging, consumer, discovery, requestReply).
   * @returns A global DynamicModule with all subsystems wired.
   */
  static async forRoot(options: EventsToolkitModuleOptions): Promise<DynamicModule> {
    const resolved = await resolveConnection(options);
    setOwnedNatsConnection(resolved.owned ? resolved.connection : null);

    return {
      module: EventsToolkitModule,
      global: true,
      imports: buildSyncImports(options, resolved),
      providers: buildSyncProviders(options, resolved),
      exports: [RequestReplyService, REQUEST_REPLY_DEPS_TOKEN],
    };
  }

  /**
   * Registers the toolkit with asynchronous options resolved via a factory provider.
   * Defers NATS connection and sub-module configuration until runtime injection.
   *
   * Registers and exports RequestReplyService and REQUEST_REPLY_DEPS_TOKEN, enabling
   * consumer services to inject RequestReplyService without explicit per-service wiring.
   * The async path uses RESOLVED_NATS_TOKEN as an intermediate singleton to guarantee
   * that JETSTREAM_TOKEN, NATS_CONNECTION_TOKEN, and REQUEST_REPLY_DEPS_TOKEN all
   * share the same underlying NATS connection.
   *
   * @param asyncOptions - Async configuration with `useFactory`, optional `inject` tokens, and optional `imports`.
   * @returns A global DynamicModule with all subsystems wired via deferred resolution.
   */
  static forRootAsync(asyncOptions: EventsToolkitModuleAsyncOptions): DynamicModule {
    return {
      module: EventsToolkitModule,
      global: true,
      imports: buildAsyncImports(asyncOptions),
      providers: buildAsyncProviders(asyncOptions),
      exports: [
        EVENTS_TOOLKIT_OPTIONS,
        JETSTREAM_TOKEN,
        NATS_CONNECTION_TOKEN,
        EventLoggerService,
        RequestReplyService,
        REQUEST_REPLY_DEPS_TOKEN,
      ],
    };
  }

  /** Closes the module-owned NATS connection, if one was created internally. */
  onModuleDestroy(): void {
    closeOwnedNatsConnection();
  }
}

function buildSyncProviders(options: EventsToolkitModuleOptions, resolved: ResolvedNats): Provider[] {
  return [
    buildLoggingProvider(options),
    buildSyncNatsConnectionProvider(resolved.connection),
    buildSyncRequestReplyDepsProvider(resolved.connection, options.requestReply),
    RequestReplyService,
  ];
}

function buildDiscoveryOptions(options: EventsToolkitModuleOptions): EventsToolkitDiscoveryOptions {
  return {
    ...options.discovery,
    capabilities: resolveCapabilities(options),
  };
}

function resolveCapabilities(options: EventsToolkitModuleOptions): string[] {
  const capabilities: string[] = [];
  if (isIdempotencyEnabled(options.idempotency)) capabilities.push('idempotency');
  if (options.outbox) capabilities.push('outbox');
  return [...capabilities, ...(options.discovery?.capabilities ?? [])];
}

function buildSyncImports(options: EventsToolkitModuleOptions, resolved: ResolvedNats): ModuleImport[] {
  const imports: ModuleImport[] = [ProducerModule.forRoot({ jetStream: resolved.jetStream })];
  if (options.consumer?.enable !== false) {
    const consumerOpts: ConsumerModuleOptions = {
      jetStream: resolved.jetStream,
      connection: resolved.connection,
      dlqSubjectBuilder: options.consumer?.dlqSubjectBuilder,
      autoCreateStreams: options.consumer?.autoCreateStreams,
      streamConfig: options.consumer?.streamConfig,
      moduleConsumerOpts: options.consumer,
    };
    imports.push(ConsumerModule.forRoot(consumerOpts));
  }
  if (options.outbox) {
    imports.push(OutboxModule.forRoot(buildOutboxModuleOptions(options.outbox)));
  }
  if (isIdempotencyEnabled(options.idempotency)) {
    imports.push(IdempotencyModule.forRoot(buildIdempotencyModuleOptions(options.idempotency)));
  }
  if (options.discovery?.enabled !== false) {
    imports.push(DiscoveryModule.forRoot(buildDiscoveryOptions(options)));
  }
  return imports;
}

function buildAsyncProviders(asyncOptions: EventsToolkitModuleAsyncOptions): Provider[] {
  return [
    buildAsyncOptionsProvider(asyncOptions),
    buildAsyncResolvedNatsProvider(),
    buildAsyncJetStreamProvider(),
    buildAsyncNatsConnectionProvider(),
    buildAsyncLoggingProvider(),
    buildAsyncRequestReplyDepsProvider(),
    RequestReplyService,
  ];
}

function buildAsyncImports(asyncOptions: EventsToolkitModuleAsyncOptions): ModuleImport[] {
  return [
    ProducerModule.forRootAsync({ useExisting: JETSTREAM_TOKEN, useFactory: async () => ({}), inject: [] }),
    buildConsumerAsyncImport(),
    buildOutboxAsyncImport(),
    buildIdempotencyAsyncImport(),
    buildDiscoveryAsyncImport(),
    ...(asyncOptions.imports ?? []),
  ];
}
