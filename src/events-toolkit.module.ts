import { DynamicModule, Module, OnModuleDestroy, Provider } from '@nestjs/common';
import { connect, NatsConnection, JetStreamClient } from 'nats';
import { ProducerModule, JETSTREAM_TOKEN } from './producer/producer.module';
import { ConsumerModule, ConsumerModuleOptions } from './consumer/consumer.module';
import { OutboxModuleOptions } from './outbox/outbox.types';
import { OutboxModule } from './outbox/outbox.module';
import { EventLoggerService, EventLoggerOptions } from './logging/event-logger.service';
import { ProducerService } from './producer/producer.service';
import { ConsumerService } from './consumer/consumer.service';
import { OutboxService } from './outbox/outbox.service';
import {
  EventsToolkitModuleOptions,
  EventsToolkitModuleAsyncOptions,
  EventsToolkitOutboxOptions,
} from './events-toolkit-options.interface';

const EVENTS_TOOLKIT_OPTIONS = 'EVENTS_TOOLKIT_OPTIONS';

interface ResolvedNats {
  connection: NatsConnection;
  jetStream: JetStreamClient;
  owned: boolean;
}

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

@Module({})
export class EventsToolkitModule implements OnModuleDestroy {
  private static ownedConnection: NatsConnection | null = null;

  static async forRoot(options: EventsToolkitModuleOptions): Promise<DynamicModule> {
    const resolved = await resolveConnection(options);
    EventsToolkitModule.ownedConnection = resolved.owned ? resolved.connection : null;

    const imports: DynamicModule[] = [ProducerModule.forRoot({ jetStream: resolved.jetStream })];

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

    const loggingProvider = buildLoggingProvider(options);

    return {
      module: EventsToolkitModule,
      imports,
      providers: [loggingProvider],
      exports: [ProducerService, ConsumerService, OutboxService, EventLoggerService],
    };
  }

  static forRootAsync(asyncOptions: EventsToolkitModuleAsyncOptions): DynamicModule {
    const optionsProvider: Provider = {
      provide: EVENTS_TOOLKIT_OPTIONS,
      useFactory: async (...args: unknown[]): Promise<EventsToolkitModuleOptions> => asyncOptions.useFactory(...args),
      inject: asyncOptions.inject ?? [],
    };

    const jetStreamProvider: Provider = {
      provide: JETSTREAM_TOKEN,
      useFactory: async (opts: EventsToolkitModuleOptions): Promise<JetStreamClient> => {
        const resolved = await resolveConnection(opts);
        EventsToolkitModule.ownedConnection = resolved.owned ? resolved.connection : null;
        return resolved.jetStream;
      },
      inject: [EVENTS_TOOLKIT_OPTIONS],
    };

    return {
      module: EventsToolkitModule,
      imports: [
        ProducerModule.forRootAsync({
          useFactory: async (...args: unknown[]) => {
            const opts = await asyncOptions.useFactory(...args);
            const resolved = await resolveConnection(opts);
            return { jetStream: resolved.jetStream };
          },
          inject: asyncOptions.inject ?? [],
        }),
        ...(asyncOptions.imports ?? []),
      ],
      providers: [optionsProvider, jetStreamProvider],
      exports: [],
    };
  }

  onModuleDestroy(): void {
    if (EventsToolkitModule.ownedConnection) {
      EventsToolkitModule.ownedConnection.close();
      EventsToolkitModule.ownedConnection = null;
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
