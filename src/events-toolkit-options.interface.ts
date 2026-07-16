import { NatsConnection, StreamConfig } from 'nats';
import { OutboxServiceOptions } from './outbox/outbox-service-options.interface';
import { EntityManagerLike } from './outbox/outbox.types';
import { Type, DynamicModule, ForwardReference } from '@nestjs/common';
import * as winston from 'winston';
import { EventsToolkitDiscoveryOptions } from './discovery/discovery-service-options.interface';
import type { RequestReplyConfig } from './request-reply/request-reply.types';

/** NATS connection configuration for EventsToolkitModule. */
export interface EventsToolkitNatsOptions {
  /** NATS server URLs (e.g. ['nats://localhost:4222']). Creates a new connection. */
  servers?: string | string[];
  /** Pre-existing NATS connection. Takes precedence over `servers`. Module won't close it. */
  connection?: NatsConnection;
}

/** Outbox persistence configuration. */
export interface EventsToolkitOutboxOptions {
  /** Backend type: 'sqlite' for file-based, 'postgres' for existing DB gateway. */
  type: 'sqlite' | 'postgres';
  /** Path to SQLite database file. Default: ':memory:'. */
  sqlitePath?: string;
  /** PostgreSQL entity manager. Required when type is 'postgres'. */
  postgres?: { entityManager: EntityManagerLike };
  /** Background processor tuning. */
  serviceOptions?: OutboxServiceOptions;
}

/** Logging configuration passed to EventLoggerService. */
export interface EventsToolkitLoggingOptions {
  /** Minimum Winston log level. Default: 'info'. */
  level?: string;
  /** Custom Winston transports. Default: Console transport. */
  transports?: winston.transport[];
}

/** Consumer subsystem toggle and options. */
export interface EventsToolkitConsumerOptions {
  /** Enable JetStream consumer. Default: true. */
  enable?: boolean;
  /** Custom DLQ subject builder. Default: prepends 'dlq.'. */
  dlqSubjectBuilder?: (subject: string) => string;
  /** When true, auto-create a JetStream stream covering each subscribed subject. Default: false. */
  autoCreateStreams?: boolean;
  /**
   * Optional overrides merged over the auto-creator's default JetStream stream config
   * for every stream created via `autoCreateStreams`.
   *
   * Accepts `Partial<StreamConfig>` from the `nats` package. Any NATS-native stream
   * configuration field can be set — e.g. `max_bytes`, `max_msgs`, `num_replicas`,
   * `max_age`, `max_msgs_per_subject`. User-supplied fields take precedence over the
   * built-in defaults.
   *
   * This is required when the NATS server account mandates `max_bytes` on every stream.
   *
   * @see {@link https://github.com/nats-io/nats.js/blob/main/jetstream/src/mod.ts StreamConfig}
   * @see {@link docs/nats-jetstream-configuration.md} for examples and field reference.
   */
  streamConfig?: Partial<StreamConfig>;
}

/** Top-level options for EventsToolkitModule.forRoot. */
export { EventsToolkitDiscoveryOptions } from './discovery/discovery-service-options.interface';

export interface EventsToolkitModuleOptions {
  /** NATS connection settings. Required. */
  nats: EventsToolkitNatsOptions;
  /** Outbox persistence configuration. Omit to disable the outbox subsystem. */
  outbox?: EventsToolkitOutboxOptions;
  /** Logging configuration passed to EventLoggerService. */
  logging?: EventsToolkitLoggingOptions;
  /** Consumer subsystem toggle and options. */
  consumer?: EventsToolkitConsumerOptions;
  /** Discovery subsystem toggle and options. */
  discovery?: EventsToolkitDiscoveryOptions;
  /**
   * Request-reply subsystem defaults applied to all RequestReplyService instances.
   * Pass `defaultTimeoutMs` to override the built-in 5000ms timeout for sync `request()` calls.
   * Omit entirely to use built-in defaults. Partial objects are merged with defaults
   * via `resolveRequestReplyConfig()` at provider construction time.
   */
  requestReply?: Partial<RequestReplyConfig>;
}

/** Asynchronous options for EventsToolkitModule.forRootAsync. */
export interface EventsToolkitModuleAsyncOptions {
  /** Additional NestJS modules to import alongside the toolkit. */
  imports?: Array<Type<unknown> | DynamicModule | Promise<DynamicModule> | ForwardReference<unknown>>;
  /** Factory that resolves toolkit options at runtime. Injected dependencies are passed as arguments. */
  useFactory: (...args: unknown[]) => Promise<EventsToolkitModuleOptions> | EventsToolkitModuleOptions;
  /** Tokens to inject into the factory function. */
  inject?: Array<string | symbol | Type<unknown>>;
}
