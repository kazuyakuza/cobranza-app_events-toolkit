import { DynamicModule, ForwardReference, Module, OnModuleDestroy, Provider, Type } from '@nestjs/common';
import { JetStreamClient } from 'nats';
import { ProducerModule } from './producer/producer.module';
import { JETSTREAM_TOKEN } from './producer/producer.constants';
import { ConsumerModule, ConsumerModuleOptions } from './consumer/consumer.module';
import { OutboxModule } from './outbox/outbox.module';
import { OutboxModuleOptions } from './outbox/outbox.types';
import { EventLoggerService } from './logging/event-logger.service';
import { DiscoveryModule } from './discovery/discovery.module';
import { RequestReplyService } from './request-reply/request-reply.service';
import { REQUEST_REPLY_DEPS_TOKEN } from './request-reply/request-reply.types';
import {
  EVENTS_TOOLKIT_OPTIONS,
  ResolvedNats,
  resolveConnection,
  buildOutboxModuleOptions,
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
import { EventsToolkitModuleOptions, EventsToolkitModuleAsyncOptions } from './events-toolkit-options.interface';

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
   * and registers+exports RequestReplyService for consumer injection.
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
   * Exports EVENTS_TOOLKIT_OPTIONS, JETSTREAM_TOKEN, EventLoggerService,
   * RequestReplyService, and REQUEST_REPLY_DEPS_TOKEN so imported sub-modules and
   * external consumers resolve these dependencies during NestJS DI compilation.
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

function buildSyncImports(options: EventsToolkitModuleOptions, resolved: ResolvedNats): ModuleImport[] {
  const imports: ModuleImport[] = [ProducerModule.forRoot({ jetStream: resolved.jetStream })];
  if (options.consumer?.enable !== false) {
    const consumerOpts: ConsumerModuleOptions = {
      jetStream: resolved.jetStream,
      dlqSubjectBuilder: options.consumer?.dlqSubjectBuilder,
    };
    imports.push(ConsumerModule.forRoot(consumerOpts));
  }
  if (options.outbox) {
    imports.push(OutboxModule.forRoot(buildOutboxModuleOptions(options.outbox)));
  }
  if (options.discovery?.enabled !== false) {
    imports.push(DiscoveryModule.forRoot(options.discovery ?? {}));
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
    buildDiscoveryAsyncImport(),
    ...(asyncOptions.imports ?? []),
  ];
}

function buildConsumerAsyncImport(): DynamicModule {
  return ConsumerModule.forRootAsync({
    useFactory: async (...args: unknown[]): Promise<ConsumerModuleOptions> => {
      const jetStream = args[0] as JetStreamClient;
      const opts = args[1] as EventsToolkitModuleOptions;
      return {
        jetStream,
        dlqSubjectBuilder: opts.consumer?.dlqSubjectBuilder,
      };
    },
    inject: [JETSTREAM_TOKEN, EVENTS_TOOLKIT_OPTIONS],
  });
}

function buildOutboxAsyncImport(): DynamicModule {
  return OutboxModule.forRootAsync({
    useFactory: async (...args: unknown[]): Promise<OutboxModuleOptions> => {
      const opts = args[0] as EventsToolkitModuleOptions;
      const outbox = opts.outbox ?? { type: 'sqlite' as const, sqlitePath: ':memory:' };
      return buildOutboxModuleOptions(outbox);
    },
    inject: [EVENTS_TOOLKIT_OPTIONS],
  });
}

function buildDiscoveryAsyncImport(): DynamicModule {
  return DiscoveryModule.forRootAsync({
    useFactory: (...args: unknown[]) => {
      const opts = args[0] as EventsToolkitModuleOptions;
      return opts.discovery ?? {};
    },
    inject: [EVENTS_TOOLKIT_OPTIONS],
  });
}
