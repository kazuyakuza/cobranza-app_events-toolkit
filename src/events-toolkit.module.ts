import { DynamicModule, ForwardReference, Module, OnModuleDestroy, Provider, Type } from '@nestjs/common';
import { connect, NatsConnection, JetStreamClient } from 'nats';
import { ProducerModule, JETSTREAM_TOKEN } from './producer/producer.module';
import { ConsumerModule, ConsumerModuleOptions } from './consumer/consumer.module';
import { OutboxModuleOptions } from './outbox/outbox.types';
import { OutboxModule } from './outbox/outbox.module';
import { EventLoggerService, EventLoggerOptions } from './logging/event-logger.service';
import { DiscoveryModule } from './discovery/discovery.module';
import {
  EventsToolkitModuleOptions,
  EventsToolkitModuleAsyncOptions,
  EventsToolkitOutboxOptions,
} from './events-toolkit-options.interface';

const EVENTS_TOOLKIT_OPTIONS = 'EVENTS_TOOLKIT_OPTIONS';

type ModuleImport = Type<unknown> | DynamicModule | Promise<DynamicModule> | ForwardReference<unknown>;

interface ResolvedNats {
  connection: NatsConnection;
  jetStream: JetStreamClient;
  owned: boolean;
}

let ownedConnection: NatsConnection | null = null;

async function resolveConnection(options: EventsToolkitModuleOptions): Promise<ResolvedNats> {
  if (options.nats.connection) {
    return {
      connection: options.nats.connection,
      jetStream: options.nats.connection.jetstream(),
      owned: false,
    };
  }
  if (options.nats.servers) {
    const connection = await connect({ servers: options.nats.servers as string[] });
    return {
      connection,
      jetStream: connection.jetstream(),
      owned: true,
    };
  }
  throw new Error('EventsToolkitModule requires either nats.connection or nats.servers');
}

function buildOutboxModuleOptions(outbox: EventsToolkitOutboxOptions): OutboxModuleOptions {
  if (outbox.type === 'postgres') {
    return {
      type: 'postgres',
      postgres: outbox.postgres,
      serviceOptions: outbox.serviceOptions,
    };
  }
  return {
    type: 'sqlite',
    sqlite: { dbPath: outbox.sqlitePath ?? ':memory:' },
    serviceOptions: outbox.serviceOptions,
  };
}

/**
 * Root module that wires together Producer, Consumer, Outbox, and Logging subsystems
 * into a single global NestJS dynamic module.
 */
@Module({})
export class EventsToolkitModule implements OnModuleDestroy {
  /**
   * Registers the toolkit with synchronous, fully-resolved options.
   * Creates or reuses a NATS connection and conditionally imports Consumer and Outbox modules.
   */
  static async forRoot(options: EventsToolkitModuleOptions): Promise<DynamicModule> {
    const resolved = await resolveConnection(options);
    ownedConnection = resolved.owned ? resolved.connection : null;

    const imports: ModuleImport[] = [ProducerModule.forRoot({ jetStream: resolved.jetStream })];

    const consumerEnabled = options.consumer?.enable !== false;
    if (consumerEnabled) {
      const consumerOpts: ConsumerModuleOptions = {
        jetStream: resolved.jetStream,
        dlqSubjectBuilder: options.consumer?.dlqSubjectBuilder,
      };
      imports.push(ConsumerModule.forRoot(consumerOpts));
    }

    if (options.outbox) {
      const outboxOpts = buildOutboxModuleOptions(options.outbox);
      imports.push(OutboxModule.forRoot(outboxOpts));
    }

    const discoveryEnabled = options.discovery?.enabled !== false;
    if (discoveryEnabled) {
      const discoveryOpts = options.discovery ?? {};
      imports.push(DiscoveryModule.forRoot(discoveryOpts));
    }

    const loggingProvider = buildLoggingProvider(options);

    return {
      module: EventsToolkitModule,
      global: true,
      imports,
      providers: [loggingProvider],
    };
  }

  /**
   * Registers the toolkit with asynchronous options resolved via a factory provider.
   * Defers NATS connection and sub-module configuration until runtime injection.
   */
  static forRootAsync(asyncOptions: EventsToolkitModuleAsyncOptions): DynamicModule {
    const optionsProvider = buildAsyncOptionsProvider(asyncOptions);
    const jetStreamProvider = buildAsyncJetStreamProvider();
    const loggingProvider = buildAsyncLoggingProvider();

    const imports: ModuleImport[] = [
      ProducerModule.forRootAsync({ useExisting: JETSTREAM_TOKEN, useFactory: async () => ({}), inject: [] }),
      buildConsumerAsyncImport(),
      buildOutboxAsyncImport(),
      buildDiscoveryAsyncImport(),
      ...(asyncOptions.imports ?? []),
    ];

    return {
      module: EventsToolkitModule,
      global: true,
      imports,
      providers: [optionsProvider, jetStreamProvider, loggingProvider],
    };
  }

  /** Closes the module-owned NATS connection, if one was created internally. */
  onModuleDestroy(): void {
    if (ownedConnection) {
      ownedConnection.close();
      ownedConnection = null;
    }
  }
}

function buildLoggingProvider(options: EventsToolkitModuleOptions): Provider {
  if (options.logging) {
    const loggerOptions: EventLoggerOptions = {
      level: options.logging.level,
      transports: options.logging.transports,
    };
    return { provide: EventLoggerService, useValue: new EventLoggerService(loggerOptions) };
  }
  return { provide: EventLoggerService, useClass: EventLoggerService };
}

function buildAsyncOptionsProvider(asyncOptions: EventsToolkitModuleAsyncOptions): Provider {
  return {
    provide: EVENTS_TOOLKIT_OPTIONS,
    useFactory: async (...args: unknown[]): Promise<EventsToolkitModuleOptions> => asyncOptions.useFactory(...args),
    inject: asyncOptions.inject ?? [],
  };
}

function buildAsyncJetStreamProvider(): Provider {
  return {
    provide: JETSTREAM_TOKEN,
    useFactory: async (opts: EventsToolkitModuleOptions): Promise<JetStreamClient> => {
      const resolved = await resolveConnection(opts);
      ownedConnection = resolved.owned ? resolved.connection : null;
      return resolved.jetStream;
    },
    inject: [EVENTS_TOOLKIT_OPTIONS],
  };
}

function buildAsyncLoggingProvider(): Provider {
  return {
    provide: EventLoggerService,
    useFactory: (opts: EventsToolkitModuleOptions): EventLoggerService => {
      if (opts.logging) {
        return new EventLoggerService({
          level: opts.logging.level,
          transports: opts.logging.transports,
        });
      }
      return new EventLoggerService();
    },
    inject: [EVENTS_TOOLKIT_OPTIONS],
  };
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
