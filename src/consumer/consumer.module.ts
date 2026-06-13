import { DynamicModule, Module, Provider, Type, ForwardReference } from '@nestjs/common';
import { DiscoveryModule, DiscoveryService, Reflector } from '@nestjs/core';
import { JetStreamClient, NatsConnection } from 'nats';
import { EventLoggerService } from '../logging/event-logger.service';
import { ConsumerService } from './consumer.service';
import { JetStreamConsumerService } from './jetstream-consumer.service';
import { JETSTREAM_CONSUMER_DEPS_TOKEN } from './jetstream-consumer-deps.interface';
import { OnEventExplorer } from './decorators/on-event.explorer';
import { ON_EVENT_EXPLORER_DEPS_TOKEN } from './decorators/on-event-explorer-deps.interface';

export const CONSUMER_MODULE_OPTIONS = 'CONSUMER_MODULE_OPTIONS';
const DISCOVERY_REFLECTOR_PAIR = 'DISCOVERY_REFLECTOR_PAIR' as unknown as Type<unknown>;
const RESOLVED_CONNECTION_TOKEN = 'RESOLVED_CONNECTION' as unknown as Type<unknown>;
const CONSUMER_SERVICES_PAIR = 'CONSUMER_SERVICES_PAIR' as unknown as Type<unknown>;

interface DiscoveryReflectorPair {
  discovery: DiscoveryService;
  reflector: Reflector;
}

interface ConsumerServicesPair {
  consumerService: ConsumerService;
  logger: EventLoggerService;
}

interface ResolvedConnection {
  jetStream: JetStreamClient;
  dlqSubjectBuilder?: (subject: string) => string;
}

/** Synchronous options for {@link ConsumerModule.forRoot}. */
export interface ConsumerModuleOptions {
  connection?: NatsConnection;
  jetStream?: JetStreamClient;
  dlqSubjectBuilder?: (subject: string) => string;
}

/** Asynchronous options for {@link ConsumerModule.forRootAsync}. */
export interface ConsumerModuleAsyncOptions {
  imports?: Array<Type<unknown> | DynamicModule | Promise<DynamicModule> | ForwardReference<unknown>>;
  useFactory: (...args: unknown[]) => Promise<ConsumerModuleOptions> | ConsumerModuleOptions;
  inject?: Array<string | symbol | Type<unknown>>;
}

function resolveJetStream(options: ConsumerModuleOptions): JetStreamClient {
  if (options.jetStream) return options.jetStream;
  if (options.connection) return options.connection.jetstream();
  throw new Error('ConsumerModule requires either connection or jetStream in options');
}

@Module({})
export class ConsumerModule {
  static forRoot(options: ConsumerModuleOptions): DynamicModule {
    const jetStream = resolveJetStream(options);

    const discoveryPairProvider: Provider = {
      provide: DISCOVERY_REFLECTOR_PAIR,
      useFactory: (discovery: DiscoveryService, reflector: Reflector) => ({ discovery, reflector }),
      inject: [DiscoveryService, Reflector],
    };

    const explorerDepsProvider: Provider = {
      provide: ON_EVENT_EXPLORER_DEPS_TOKEN,
      useFactory: (pair: DiscoveryReflectorPair, consumerService: ConsumerService) => ({
        discovery: pair.discovery,
        reflector: pair.reflector,
        consumerService,
      }),
      inject: [DISCOVERY_REFLECTOR_PAIR, ConsumerService],
    };

    const consumerDepsProvider: Provider = {
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
      providers: [
        discoveryPairProvider,
        explorerDepsProvider,
        consumerDepsProvider,
        ConsumerService,
        JetStreamConsumerService,
        OnEventExplorer,
      ],
      exports: [ConsumerService, JetStreamConsumerService, OnEventExplorer],
    };
  }

  static forRootAsync(asyncOptions: ConsumerModuleAsyncOptions): DynamicModule {
    const optionsProvider: Provider = {
      provide: CONSUMER_MODULE_OPTIONS,
      useFactory: async (...args: unknown[]): Promise<ConsumerModuleOptions> => asyncOptions.useFactory(...args),
      inject: asyncOptions.inject ?? [],
    };

    const discoveryPairProvider: Provider = {
      provide: DISCOVERY_REFLECTOR_PAIR,
      useFactory: (discovery: DiscoveryService, reflector: Reflector) => ({ discovery, reflector }),
      inject: [DiscoveryService, Reflector],
    };

    const explorerDepsProvider: Provider = {
      provide: ON_EVENT_EXPLORER_DEPS_TOKEN,
      useFactory: (pair: DiscoveryReflectorPair, consumerService: ConsumerService) => ({
        discovery: pair.discovery,
        reflector: pair.reflector,
        consumerService,
      }),
      inject: [DISCOVERY_REFLECTOR_PAIR, ConsumerService],
    };

    const resolvedConnectionProvider: Provider = {
      provide: RESOLVED_CONNECTION_TOKEN,
      useFactory: (moduleOptions: ConsumerModuleOptions) => ({
        jetStream: resolveJetStream(moduleOptions),
        dlqSubjectBuilder: moduleOptions.dlqSubjectBuilder,
      }),
      inject: [CONSUMER_MODULE_OPTIONS],
    };

    const consumerServicesProvider: Provider = {
      provide: CONSUMER_SERVICES_PAIR,
      useFactory: (consumerService: ConsumerService, logger: EventLoggerService) => ({ consumerService, logger }),
      inject: [ConsumerService, EventLoggerService],
    };

    const consumerDepsProvider: Provider = {
      provide: JETSTREAM_CONSUMER_DEPS_TOKEN,
      useFactory: (connection: ResolvedConnection, services: ConsumerServicesPair) => ({
        jetStream: connection.jetStream,
        consumerService: services.consumerService,
        logger: services.logger,
        dlqSubjectBuilder: connection.dlqSubjectBuilder,
      }),
      inject: [RESOLVED_CONNECTION_TOKEN, CONSUMER_SERVICES_PAIR],
    };

    return {
      module: ConsumerModule,
      global: true,
      imports: [DiscoveryModule, ...(asyncOptions.imports ?? [])],
      providers: [
        optionsProvider,
        discoveryPairProvider,
        explorerDepsProvider,
        resolvedConnectionProvider,
        consumerServicesProvider,
        consumerDepsProvider,
        ConsumerService,
        JetStreamConsumerService,
        OnEventExplorer,
      ],
      exports: [ConsumerService, JetStreamConsumerService, OnEventExplorer],
    };
  }
}
