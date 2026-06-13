import { DynamicModule, Provider, Type } from '@nestjs/common';
import { JetStreamClient, NatsConnection } from 'nats';
import { EventLoggerService } from '../logging/event-logger.service';
import { ProducerService } from './producer.service';

/** Injection token for the JetStream instance used by ProducerService. */
export const JETSTREAM_TOKEN = 'NATS_JETSTREAM';

/** Synchronous options for {@link ProducerModule.forRoot}. */
export interface ProducerModuleOptions {
  /** An existing NATS connection — JetStream will be obtained via `connection.jetstream()`. */
  connection?: NatsConnection;
  /** A pre-obtained JetStream client instance — takes precedence over `connection`. */
  jetStream?: JetStreamClient;
}

/** Asynchronous options for {@link ProducerModule.forRootAsync}. */
export interface ProducerModuleAsyncOptions {
  /** Factory that resolves module options, optionally injecting dependencies. */
  useFactory: (...args: unknown[]) => Promise<ProducerModuleOptions> | ProducerModuleOptions;
  /** Optional dependencies to inject into the factory. */
  inject?: Array<string | symbol | Type<unknown>>;
}

/** Resolves a JetStream instance from the provided module options. */
function resolveJetStream(options: ProducerModuleOptions): JetStreamClient {
  if (options.jetStream) {
    return options.jetStream;
  }
  if (options.connection) {
    return options.connection.jetstream();
  }
  throw new Error('ProducerModule requires either connection or jetStream in options');
}

/** NestJS DynamicModule for event publishing via NATS JetStream. */
export class ProducerModule {
  static forRoot(options: ProducerModuleOptions): DynamicModule {
    const jetStream = resolveJetStream(options);
    return {
      module: ProducerModule,
      global: true,
      providers: [{ provide: JETSTREAM_TOKEN, useValue: jetStream }, EventLoggerService, ProducerService],
      exports: [ProducerService],
    };
  }

  static forRootAsync(asyncOptions: ProducerModuleAsyncOptions): DynamicModule {
    const jetStreamProvider: Provider = {
      provide: JETSTREAM_TOKEN,
      useFactory: async (...args: unknown[]): Promise<JetStreamClient> => {
        const moduleOptions = await asyncOptions.useFactory(...args);
        return resolveJetStream(moduleOptions);
      },
      inject: asyncOptions.inject ?? [],
    };
    return {
      module: ProducerModule,
      global: true,
      providers: [jetStreamProvider, EventLoggerService, ProducerService],
      exports: [ProducerService],
    };
  }
}
