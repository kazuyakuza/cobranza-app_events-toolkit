import { Type } from '@nestjs/common';
import { JetStreamClient, NatsConnection } from 'nats';

/** NestJS injection token for the JetStream client used by {@link ProducerService}. */
export const JETSTREAM_TOKEN = 'NATS_JETSTREAM';

/** Synchronous options for {@link ProducerModule.forRoot}. */
export interface ProducerModuleOptions {
  /** An existing NATS connection — JetStream is obtained via `connection.jetstream()`. */
  connection?: NatsConnection;
  /** A pre-obtained JetStream client instance — takes precedence over `connection`. */
  jetStream?: JetStreamClient;
}

/** Asynchronous options for {@link ProducerModule.forRootAsync}. */
export interface ProducerModuleAsyncOptions {
  /** Existing token that provides a JetStreamClient; skips JETSTREAM_TOKEN provider creation. */
  useExisting?: string | symbol | Type<unknown>;
  /** Factory that resolves module options, optionally injecting dependencies. */
  useFactory: (...args: unknown[]) => Promise<ProducerModuleOptions> | ProducerModuleOptions;
  /** Optional dependencies to inject into the factory. */
  inject?: Array<string | symbol | Type<unknown>>;
}
