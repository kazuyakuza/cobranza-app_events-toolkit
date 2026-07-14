/**
 * Provider factories for EventsToolkitModule.
 *
 * DI graph design:
 * ─────────────────
 * The async path must guarantee a single NATS connection is created and shared by
 * every consumer (JetStream, NatsConnection, RequestReplyDeps). To achieve this,
 * `RESOLVED_NATS_TOKEN` acts as a singleton intermediate provider:
 *
 *   EVENTS_TOOLKIT_OPTIONS
 *        │
 *        ▼
 *   RESOLVED_NATS_TOKEN  ── single connection created once via resolveConnection()
 *        │
 *        ├──► JETSTREAM_TOKEN          (derived: resolved.jetStream)
 *        └──► NATS_CONNECTION_TOKEN    (derived: resolved.connection)
 *
 * The sync path skips the intermediate token and provides JETSTREAM_TOKEN /
 * NATS_CONNECTION_TOKEN directly from the already-resolved connection.
 *
 * REQUEST_REPLY_DEPS_TOKEN bundles the NatsConnection, ProducerService,
 * EventLoggerService, and resolved RequestReplyConfig into a single injectable
 * object consumed by RequestReplyService.
 */
import { Provider } from '@nestjs/common';
import { connect, JetStreamClient, NatsConnection } from 'nats';
import { EventLoggerService } from './logging/event-logger.service';
import { ProducerService } from './producer/producer.service';
import { JETSTREAM_TOKEN } from './producer/producer.constants';
import { OutboxModuleOptions } from './outbox/outbox.types';
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
  EventsToolkitLoggingOptions,
} from './events-toolkit-options.interface';

/** Injection token for the resolved EventsToolkitModule options object. */
export const EVENTS_TOOLKIT_OPTIONS = 'EVENTS_TOOLKIT_OPTIONS';

/**
 * Internal token carrying the single resolved NATS connection + jetStream + owned flag.
 * Exists only in the async path to ensure JETSTREAM_TOKEN and NATS_CONNECTION_TOKEN
 * are derived from the same underlying connection, preventing duplicate connections.
 */
export const RESOLVED_NATS_TOKEN = 'EVENTS_TOOLKIT_RESOLVED_NATS';

/** Resolved NATS connection pair used to derive jetStream and NatsConnection providers. */
export interface ResolvedNats {
  connection: NatsConnection;
  jetStream: JetStreamClient;
  owned: boolean;
}

let ownedNatsConnection: NatsConnection | null = null;

/**
 * Records the module-owned NATS connection for cleanup on module destroy.
 * Only connections created internally (via `servers`) are tracked; user-provided
 * connections are never owned and must pass `null` to skip tracking.
 * @param connection - The NATS connection to track, or `null` to clear.
 */
export function setOwnedNatsConnection(connection: NatsConnection | null): void {
  ownedNatsConnection = connection;
}

/**
 * Closes the module-owned NATS connection, if one was created internally.
 * Safe to call multiple times — subsequent calls are no-ops after the first.
 */
export function closeOwnedNatsConnection(): void {
  if (ownedNatsConnection) {
    ownedNatsConnection.close();
    ownedNatsConnection = null;
  }
}

/**
 * Resolves a NATS connection + JetStream client from synchronous toolkit options.
 * Prefers a user-provided `connection` over `servers`; if `servers` is used, the
 * returned `owned` flag is `true` so the caller knows to close it on destroy.
 * @param options - Toolkit options containing either `nats.connection` or `nats.servers`.
 * @returns A resolved NATS connection pair with ownership flag.
 * @throws If neither `connection` nor `servers` is provided.
 */
export async function resolveConnection(options: EventsToolkitModuleOptions): Promise<ResolvedNats> {
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

/**
 * Builds OutboxModule options from the toolkit-level outbox config.
 * Maps the union-typed `EventsToolkitOutboxOptions` to the discriminated
 * `OutboxModuleOptions` shape expected by `OutboxModule.forRoot`.
 * @param outbox - Toolkit-level outbox configuration.
 * @returns OutboxModuleOptions ready for OutboxModule registration.
 */
export function buildOutboxModuleOptions(outbox: EventsToolkitOutboxOptions): OutboxModuleOptions {
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

/** Constructs an EventLoggerService from optional logging options. */
function buildEventLogger(logging?: EventsToolkitLoggingOptions): EventLoggerService {
  return logging
    ? new EventLoggerService({ level: logging.level, transports: logging.transports })
    : new EventLoggerService();
}

/**
 * Provider for EventLoggerService from synchronous options (forRoot path).
 * @param options - Toolkit options; only `options.logging` is consumed.
 * @returns A NestJS provider that supplies a pre-configured EventLoggerService instance.
 */
export function buildLoggingProvider(options: EventsToolkitModuleOptions): Provider {
  return { provide: EventLoggerService, useValue: buildEventLogger(options.logging) };
}

/**
 * Provider for NATS_CONNECTION_TOKEN from a pre-resolved connection (forRoot path).
 * @param connection - The already-resolved NatsConnection to expose under NATS_CONNECTION_TOKEN.
 * @returns A NestJS value provider bound to NATS_CONNECTION_TOKEN.
 */
export function buildSyncNatsConnectionProvider(connection: NatsConnection): Provider {
  return { provide: NATS_CONNECTION_TOKEN, useValue: connection };
}

/**
 * Provider for REQUEST_REPLY_DEPS_TOKEN from synchronous options (forRoot path).
 * Bundles the NatsConnection, ProducerService, EventLoggerService, and resolved
 * RequestReplyConfig into a single injectable object for RequestReplyService.
 * @param connection - The resolved NatsConnection for request operations.
 * @param requestReply - Optional partial config; defaults are applied via resolveRequestReplyConfig.
 * @returns A NestJS factory provider bound to REQUEST_REPLY_DEPS_TOKEN.
 */
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

/**
 * Provider for EVENTS_TOOLKIT_OPTIONS from the async factory (forRootAsync path).
 * Bridges the user-supplied `useFactory` into the DI graph under a stable token
 * that downstream async providers (logging, outbox, request-reply) inject.
 * @param asyncOptions - Async options containing `useFactory` and optional `inject` tokens.
 * @returns A NestJS factory provider bound to EVENTS_TOOLKIT_OPTIONS.
 */
export function buildAsyncOptionsProvider(asyncOptions: EventsToolkitModuleAsyncOptions): Provider {
  return {
    provide: EVENTS_TOOLKIT_OPTIONS,
    useFactory: asyncOptions.useFactory,
    inject: asyncOptions.inject ?? [],
  };
}

/**
 * Internal provider that resolves the NATS connection exactly once (forRootAsync path).
 * Sits between EVENTS_TOOLKIT_OPTIONS and the two derived tokens (JETSTREAM_TOKEN,
 * NATS_CONNECTION_TOKEN) to guarantee a single connection is shared across all consumers.
 * Also tracks ownership so the module can close internally-created connections on destroy.
 * @returns A NestJS async factory provider bound to RESOLVED_NATS_TOKEN.
 */
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

/**
 * Provider for JETSTREAM_TOKEN derived from the single resolved NATS connection.
 * Ensures ProducerModule and ConsumerModule share the same JetStreamClient instance.
 * @returns A NestJS factory provider bound to JETSTREAM_TOKEN, injecting RESOLVED_NATS_TOKEN.
 */
export function buildAsyncJetStreamProvider(): Provider {
  return {
    provide: JETSTREAM_TOKEN,
    useFactory: (resolved: ResolvedNats): JetStreamClient => resolved.jetStream,
    inject: [RESOLVED_NATS_TOKEN],
  };
}

/**
 * Provider for NATS_CONNECTION_TOKEN derived from the single resolved NATS connection.
 * Ensures RequestReplyService and any other consumer of NATS_CONNECTION_TOKEN
 * receive the same connection instance used by JetStream, not a duplicate.
 * @returns A NestJS factory provider bound to NATS_CONNECTION_TOKEN, injecting RESOLVED_NATS_TOKEN.
 */
export function buildAsyncNatsConnectionProvider(): Provider {
  return {
    provide: NATS_CONNECTION_TOKEN,
    useFactory: (resolved: ResolvedNats): NatsConnection => resolved.connection,
    inject: [RESOLVED_NATS_TOKEN],
  };
}

/**
 * Provider for EventLoggerService from async options (forRootAsync path).
 * Defers logger construction until runtime so that `logging` config resolved
 * from the async factory is available at injection time.
 * @returns A NestJS factory provider bound to EventLoggerService, injecting EVENTS_TOOLKIT_OPTIONS.
 */
export function buildAsyncLoggingProvider(): Provider {
  return {
    provide: EventLoggerService,
    useFactory: (opts: EventsToolkitModuleOptions): EventLoggerService => buildEventLogger(opts.logging),
    inject: [EVENTS_TOOLKIT_OPTIONS],
  };
}

/**
 * Provider for REQUEST_REPLY_DEPS_TOKEN from async options (forRootAsync path).
 * Assembles the dependency bundle (NatsConnection, ProducerService, EventLoggerService,
 * resolved config) that RequestReplyService requires. All four dependencies are injected
 * via the standard DI graph — NATS_CONNECTION_TOKEN is sourced from RESOLVED_NATS_TOKEN
 * to guarantee the same connection used by JetStream.
 * @returns A NestJS factory provider bound to REQUEST_REPLY_DEPS_TOKEN.
 */
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
