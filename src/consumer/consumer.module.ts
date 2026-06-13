import { DynamicModule, Provider, Type } from '@nestjs/common';
import { JetStreamClient, NatsConnection } from 'nats';
import { EventLoggerService } from '../logging/event-logger.service';
import { ConsumerService } from './consumer.service';
import { JetStreamConsumerService } from './jetstream-consumer.service';

/** Injection token for the JetStream client instance used by ConsumerModule. */
export const NATS_JETSTREAM_TOKEN = 'NATS_CONSUMER_JETSTREAM';

/** Injection token for the configurable DLQ subject builder function. */
export const DLQ_SUBJECT_BUILDER_TOKEN = 'DLQ_SUBJECT_BUILDER';

/** Synchronous options for {@link ConsumerModule.forRoot}. */
export interface ConsumerModuleOptions {
  /** An existing NATS connection — JetStream will be obtained via `connection.jetstream()`. */
  connection?: NatsConnection;
  /** A pre-obtained JetStream client instance — takes precedence over `connection`. */
  jetStream?: JetStreamClient;
  /** Custom function that transforms a consumed subject into its DLQ subject. Defaults to prepending `dlq.`. */
  dlqSubjectBuilder?: (subject: string) => string;
}

/** Asynchronous options for {@link ConsumerModule.forRootAsync}. */
export interface ConsumerModuleAsyncOptions {
  /** Factory that resolves module options, optionally injecting dependencies. */
  useFactory: (...args: unknown[]) => Promise<ConsumerModuleOptions> | ConsumerModuleOptions;
  /** Optional dependencies to inject into the factory. */
  inject?: Array<string | symbol | Type<unknown>>;
}

/** Resolves a JetStream instance from the provided module options. */
function resolveJetStream(options: ConsumerModuleOptions): JetStreamClient {
  if (options.jetStream) {
    return options.jetStream;
  }
  if (options.connection) {
    return options.connection.jetstream();
  }
  throw new Error('ConsumerModule requires either connection or jetStream in options');
}

/** NestJS DynamicModule for consuming events from NATS JetStream. */
export class ConsumerModule {
  /**
   * Registers the ConsumerModule with synchronously resolved options.
   *
   * @param options - Connection, JetStream instance, and optional DLQ builder.
   */
  static forRoot(options: ConsumerModuleOptions): DynamicModule {
    const jetStream = resolveJetStream(options);
    const providers: Provider[] = [
      { provide: NATS_JETSTREAM_TOKEN, useValue: jetStream },
      EventLoggerService,
      ConsumerService,
    ];
    if (options.dlqSubjectBuilder) {
      providers.push({ provide: DLQ_SUBJECT_BUILDER_TOKEN, useValue: options.dlqSubjectBuilder });
    }
    providers.push(JetStreamConsumerService);
    return {
      module: ConsumerModule,
      global: true,
      providers,
      exports: [ConsumerService, JetStreamConsumerService],
    };
  }

  /**
   * Registers the ConsumerModule with asynchronously resolved options.
   *
   * Use this when the JetStream connection depends on other injected providers.
   *
   * @param asyncOptions - Factory and optional injection tokens for deferred resolution.
   */
  static forRootAsync(asyncOptions: ConsumerModuleAsyncOptions): DynamicModule {
    const jetStreamProvider: Provider = {
      provide: NATS_JETSTREAM_TOKEN,
      useFactory: async (...args: unknown[]): Promise<JetStreamClient> => {
        const moduleOptions = await asyncOptions.useFactory(...args);
        return resolveJetStream(moduleOptions);
      },
      inject: asyncOptions.inject ?? [],
    };
    const dlqProvider: Provider = {
      provide: DLQ_SUBJECT_BUILDER_TOKEN,
      useFactory: async (...args: unknown[]): Promise<((subject: string) => string) | undefined> => {
        const moduleOptions = await asyncOptions.useFactory(...args);
        return moduleOptions.dlqSubjectBuilder;
      },
      inject: asyncOptions.inject ?? [],
    };
    return {
      module: ConsumerModule,
      global: true,
      providers: [jetStreamProvider, dlqProvider, EventLoggerService, ConsumerService, JetStreamConsumerService],
      exports: [ConsumerService, JetStreamConsumerService],
    };
  }
}
