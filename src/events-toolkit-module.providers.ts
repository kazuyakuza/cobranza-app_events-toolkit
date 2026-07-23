import { Provider } from '@nestjs/common';
import { connect, JetStreamClient, NatsConnection } from 'nats';
import { EventLoggerService } from './logging/event-logger.service';
import { ProducerService } from './producer/producer.service';
import { JETSTREAM_TOKEN } from './producer/producer.constants';
import { OutboxModuleOptions } from './outbox/outbox.types';
import { IdempotencyModuleOptions } from './idempotency/idempotency.types';
import {
  REQUEST_REPLY_DEPS_TOKEN,
  NATS_CONNECTION_TOKEN,
  resolveRequestReplyConfig,
  RequestReplyConfig,
  RequestReplyDeps,
} from './request-reply/request-reply.types';
import {
  EventsToolkitModuleOptions,
  EventsToolkitModuleAsyncOptions,
  EventsToolkitOutboxOptions,
  EventsToolkitIdempotencyOptions,
  EventsToolkitLoggingOptions,
} from './events-toolkit-options.interface';
import { EVENTS_TOOLKIT_OPTIONS, RESOLVED_NATS_TOKEN, ResolvedNats } from './events-toolkit-module.tokens';

let ownedNatsConnection: NatsConnection | null = null;

/** Records the module-owned NATS connection for cleanup on module destroy. */
export function setOwnedNatsConnection(connection: NatsConnection | null): void {
  ownedNatsConnection = connection;
}

/** Closes the module-owned NATS connection. Safe to call multiple times. */
export function closeOwnedNatsConnection(): void {
  if (ownedNatsConnection) {
    ownedNatsConnection.close();
    ownedNatsConnection = null;
  }
}

/** Resolves a NATS connection + JetStream client from synchronous toolkit options. */
export async function resolveConnection(options: EventsToolkitModuleOptions): Promise<ResolvedNats> {
  if (options.nats.connection) {
    return { connection: options.nats.connection, jetStream: options.nats.connection.jetstream(), owned: false };
  }
  if (options.nats.servers) {
    const connection = await connect({ servers: options.nats.servers as string[] });
    return { connection, jetStream: connection.jetstream(), owned: true };
  }
  throw new Error('EventsToolkitModule requires either nats.connection or nats.servers');
}

/** Builds OutboxModule options from the toolkit-level outbox config. */
export function buildOutboxModuleOptions(outbox: EventsToolkitOutboxOptions): OutboxModuleOptions {
  if (outbox.type === 'postgres') {
    return { type: 'postgres', postgres: outbox.postgres, serviceOptions: outbox.serviceOptions };
  }
  return { type: 'sqlite', sqlite: { dbPath: outbox.sqlitePath ?? ':memory:' }, serviceOptions: outbox.serviceOptions };
}

/**
 * Builds {@link IdempotencyModuleOptions} from the toolkit-level idempotency config.
 *
 * Translates the user-facing {@link EventsToolkitIdempotencyOptions} into the
 * shape expected by {@link IdempotencyModule.forRoot}, mapping `sqlitePath`
 * to `sqlite.dbPath` and passing through `postgres` and `serviceOptions`.
 *
 * @param idempotency - Toolkit-level idempotency configuration.
 * @returns Module-level options ready for `IdempotencyModule.forRoot()`.
 *
 * @see {@link buildOutboxModuleOptions} for the analogous outbox mapper.
 */
export function buildIdempotencyModuleOptions(idempotency: EventsToolkitIdempotencyOptions): IdempotencyModuleOptions {
  if (idempotency.type === 'postgres') {
    return {
      type: 'postgres',
      postgres: idempotency.postgres,
      serviceOptions: idempotency.serviceOptions,
    };
  }
  if (idempotency.type === 'memory') {
    return { type: 'memory', serviceOptions: idempotency.serviceOptions };
  }
  return {
    type: 'sqlite',
    sqlite: { dbPath: idempotency.sqlitePath ?? ':memory:' },
    serviceOptions: idempotency.serviceOptions,
  };
}

function buildEventLogger(logging?: EventsToolkitLoggingOptions): EventLoggerService {
  return logging
    ? new EventLoggerService({ level: logging.level, transports: logging.transports })
    : new EventLoggerService();
}

/** Provider for EventLoggerService from synchronous options (forRoot path). */
export function buildLoggingProvider(options: EventsToolkitModuleOptions): Provider {
  return { provide: EventLoggerService, useValue: buildEventLogger(options.logging) };
}

/** Provider for NATS_CONNECTION_TOKEN from a pre-resolved connection (forRoot path). */
export function buildSyncNatsConnectionProvider(connection: NatsConnection): Provider {
  return { provide: NATS_CONNECTION_TOKEN, useValue: connection };
}

/** Provider for REQUEST_REPLY_DEPS_TOKEN from synchronous options (forRoot path). */
export function buildSyncRequestReplyDepsProvider(
  connection: NatsConnection,
  requestReply?: Partial<RequestReplyConfig>,
): Provider {
  return {
    provide: REQUEST_REPLY_DEPS_TOKEN,
    useFactory: (producerService: ProducerService, logger: EventLoggerService): RequestReplyDeps => ({
      natsConnection: connection,
      producerService,
      logger,
      config: resolveRequestReplyConfig(requestReply),
    }),
    inject: [ProducerService, EventLoggerService],
  };
}

/** Provider for EVENTS_TOOLKIT_OPTIONS from the async factory (forRootAsync path). */
export function buildAsyncOptionsProvider(asyncOptions: EventsToolkitModuleAsyncOptions): Provider {
  return {
    provide: EVENTS_TOOLKIT_OPTIONS,
    useFactory: asyncOptions.useFactory,
    inject: asyncOptions.inject ?? [],
  };
}

/** Internal provider that resolves the NATS connection exactly once (forRootAsync path). */
export function buildAsyncResolvedNatsProvider(): Provider {
  return {
    provide: RESOLVED_NATS_TOKEN,
    useFactory: async (opts: EventsToolkitModuleOptions): Promise<ResolvedNats> => {
      const resolved = await resolveConnection(opts);
      setOwnedNatsConnection(resolved.owned ? resolved.connection : null);
      return resolved;
    },
    inject: [EVENTS_TOOLKIT_OPTIONS],
  };
}

/** Provider for JETSTREAM_TOKEN derived from the single resolved NATS connection. */
export function buildAsyncJetStreamProvider(): Provider {
  return {
    provide: JETSTREAM_TOKEN,
    useFactory: (resolved: ResolvedNats): JetStreamClient => resolved.jetStream,
    inject: [RESOLVED_NATS_TOKEN],
  };
}

/** Provider for NATS_CONNECTION_TOKEN derived from the single resolved NATS connection. */
export function buildAsyncNatsConnectionProvider(): Provider {
  return {
    provide: NATS_CONNECTION_TOKEN,
    useFactory: (resolved: ResolvedNats): NatsConnection => resolved.connection,
    inject: [RESOLVED_NATS_TOKEN],
  };
}

/** Provider for EventLoggerService from async options (forRootAsync path). */
export function buildAsyncLoggingProvider(): Provider {
  return {
    provide: EventLoggerService,
    useFactory: (opts: EventsToolkitModuleOptions): EventLoggerService => buildEventLogger(opts.logging),
    inject: [EVENTS_TOOLKIT_OPTIONS],
  };
}

/** Provider for REQUEST_REPLY_DEPS_TOKEN from async options (forRootAsync path). */
export function buildAsyncRequestReplyDepsProvider(): Provider {
  return {
    provide: REQUEST_REPLY_DEPS_TOKEN,
    useFactory: (...args: unknown[]): RequestReplyDeps => {
      const [natsConnection, producerService, logger, opts] = args as [
        NatsConnection,
        ProducerService,
        EventLoggerService,
        EventsToolkitModuleOptions,
      ];
      return {
        natsConnection,
        producerService,
        logger,
        config: resolveRequestReplyConfig(opts.requestReply),
      };
    },
    inject: [NATS_CONNECTION_TOKEN, ProducerService, EventLoggerService, EVENTS_TOOLKIT_OPTIONS],
  };
}
