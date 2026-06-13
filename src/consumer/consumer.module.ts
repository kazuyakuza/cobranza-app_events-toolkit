import { DynamicModule, Module, Provider, Type, ForwardReference } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { JetStreamClient, NatsConnection } from 'nats';
import { EventLoggerService } from '../logging/event-logger.service';
import { ConsumerService } from './consumer.service';
import { JetStreamConsumerService } from './jetstream-consumer.service';
import { JETSTREAM_CONSUMER_DEPS_TOKEN } from './jetstream-consumer-deps.interface';
import { OnEventExplorer } from './decorators/on-event.explorer';

/** Injection token for resolved {@link ConsumerModuleOptions}. */
export const CONSUMER_MODULE_OPTIONS = 'CONSUMER_MODULE_OPTIONS';

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
  /** Optional modules to import whose providers are available to the factory. */
  imports?: Array<Type<unknown> | DynamicModule | Promise<DynamicModule> | ForwardReference<unknown>>;
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

/**
 * NestJS DynamicModule for consuming events from NATS JetStream.
 *
 * The host application MUST provide {@link EventLoggerService} globally
 * (e.g. via a root module or a shared logging module).
 */
@Module({})
export class ConsumerModule {
  /**
   * Registers the ConsumerModule with synchronously resolved options.
   */
  static forRoot(options: ConsumerModuleOptions): DynamicModule {
    const jetStream = resolveJetStream(options);
    const depsProvider: Provider = {
      provide: JETSTREAM_CONSUMER_DEPS_TOKEN,
      useFactory: (consumerService: ConsumerService, logger: EventLoggerService) => ({
        jetStream,
        consumerService,
        logger,
        dlqSubjectBuilder: options.dlqSubjectBuilder,
      }),
      inject: [ConsumerService, EventLoggerService],
    };
    return {
      module: ConsumerModule,
      global: true,
      imports: [DiscoveryModule],
      providers: [depsProvider, ConsumerService, JetStreamConsumerService, OnEventExplorer],
      exports: [ConsumerService, JetStreamConsumerService, OnEventExplorer],
    };
  }

  /**
   * Registers the ConsumerModule with asynchronously resolved options.
   *
   * Use this when the JetStream connection depends on other injected providers.
   * The factory is invoked exactly once — its result is shared across all providers.
   */
  static forRootAsync(asyncOptions: ConsumerModuleAsyncOptions): DynamicModule {
    const optionsProvider: Provider = {
      provide: CONSUMER_MODULE_OPTIONS,
      useFactory: async (...args: unknown[]): Promise<ConsumerModuleOptions> => asyncOptions.useFactory(...args),
      inject: asyncOptions.inject ?? [],
    };
    const depsProvider: Provider = {
      provide: JETSTREAM_CONSUMER_DEPS_TOKEN,
      useFactory: (
        moduleOptions: ConsumerModuleOptions,
        consumerService: ConsumerService,
        logger: EventLoggerService,
      ) => ({
        jetStream: resolveJetStream(moduleOptions),
        consumerService,
        logger,
        dlqSubjectBuilder: moduleOptions.dlqSubjectBuilder,
      }),
      inject: [CONSUMER_MODULE_OPTIONS, ConsumerService, EventLoggerService],
    };
    return {
      module: ConsumerModule,
      global: true,
      imports: [DiscoveryModule, ...(asyncOptions.imports ?? [])],
      providers: [optionsProvider, depsProvider, ConsumerService, JetStreamConsumerService, OnEventExplorer],
      exports: [ConsumerService, JetStreamConsumerService, OnEventExplorer],
    };
  }
}
