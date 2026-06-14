import { NatsConnection } from 'nats';
import { OutboxServiceOptions } from './outbox/outbox-service-options.interface';
import { EntityManagerLike } from './outbox/outbox.types';
import { Type, DynamicModule, ForwardReference } from '@nestjs/common';
import * as winston from 'winston';

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
}

/** Top-level options for EventsToolkitModule.forRoot. */
export interface EventsToolkitModuleOptions {
  nats: EventsToolkitNatsOptions;
  outbox?: EventsToolkitOutboxOptions;
  logging?: EventsToolkitLoggingOptions;
  consumer?: EventsToolkitConsumerOptions;
}

/** Asynchronous options for EventsToolkitModule.forRootAsync. */
export interface EventsToolkitModuleAsyncOptions {
  imports?: Array<Type<unknown> | DynamicModule | Promise<DynamicModule> | ForwardReference<unknown>>;
  useFactory: (...args: unknown[]) => Promise<EventsToolkitModuleOptions> | EventsToolkitModuleOptions;
  inject?: Array<string | symbol | Type<unknown>>;
}
