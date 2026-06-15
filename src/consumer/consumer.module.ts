import { DynamicModule, Module, Type, ForwardReference } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { DiscoveryService, Reflector } from '@nestjs/core';
import { JetStreamClient, NatsConnection } from 'nats';
import { EventLoggerService } from '../logging/event-logger.service';
import { ConsumerService } from './consumer.service';
import { JetStreamConsumerService } from './jetstream-consumer.service';
import { OnEventExplorer } from './decorators/on-event.explorer';
import { OnRequestReplyExplorer } from './decorators/on-request-reply.explorer';
import { RequestReplyConsumerService } from './request-reply-consumer.service';
import {
  createDiscoveryPairProvider,
  createOnEventExplorerDepsProvider,
  createRequestReplyExplorerDepsProvider,
  createSyncJetStreamConsumerDepsProvider,
  createSyncRequestReplyConsumerDepsProvider,
  createAsyncOptionsProvider,
  createAsyncResolvedConnectionProvider,
  createAsyncConsumerServicesProvider,
  createAsyncJetStreamConsumerDepsProvider,
  createAsyncRequestReplyConsumerDepsProvider,
} from './consumer-module.providers';

export const CONSUMER_MODULE_OPTIONS = 'CONSUMER_MODULE_OPTIONS';
export const DISCOVERY_REFLECTOR_PAIR = 'DISCOVERY_REFLECTOR_PAIR' as unknown as Type<unknown>;
export const RESOLVED_CONNECTION_TOKEN = 'RESOLVED_CONNECTION' as unknown as Type<unknown>;
export const CONSUMER_SERVICES_PAIR = 'CONSUMER_SERVICES_PAIR' as unknown as Type<unknown>;

export interface DiscoveryReflectorPair {
  discovery: DiscoveryService;
  reflector: Reflector;
}

export interface ConsumerServicesPair {
  consumerService: ConsumerService;
  logger: EventLoggerService;
}

export interface ResolvedConnection {
  jetStream: JetStreamClient;
  dlqSubjectBuilder?: (subject: string) => string;
}

/** Synchronous options for {@link ConsumerModule.forRoot}. */
export interface ConsumerModuleOptions {
  connection?: NatsConnection;
  jetStream?: JetStreamClient;
  dlqSubjectBuilder?: (subject: string) => string;
  /** NATS subject pattern for request-reply response messages. */
  responseSubjectPattern?: string;
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

    return {
      module: ConsumerModule,
      global: true,
      imports: [DiscoveryModule],
      providers: [
        createDiscoveryPairProvider(),
        createOnEventExplorerDepsProvider(),
        createSyncJetStreamConsumerDepsProvider(jetStream, options.dlqSubjectBuilder),
        createRequestReplyExplorerDepsProvider(),
        createSyncRequestReplyConsumerDepsProvider(
          jetStream,
          options.responseSubjectPattern,
          options.dlqSubjectBuilder,
        ),
        ConsumerService,
        JetStreamConsumerService,
        OnEventExplorer,
        RequestReplyConsumerService,
        OnRequestReplyExplorer,
      ],
      exports: [
        ConsumerService,
        JetStreamConsumerService,
        OnEventExplorer,
        RequestReplyConsumerService,
        OnRequestReplyExplorer,
      ],
    };
  }

  static forRootAsync(asyncOptions: ConsumerModuleAsyncOptions): DynamicModule {
    return {
      module: ConsumerModule,
      global: true,
      imports: [DiscoveryModule, ...(asyncOptions.imports ?? [])],
      providers: [
        createAsyncOptionsProvider(asyncOptions),
        createDiscoveryPairProvider(),
        createOnEventExplorerDepsProvider(),
        createRequestReplyExplorerDepsProvider(),
        createAsyncRequestReplyConsumerDepsProvider(),
        createAsyncResolvedConnectionProvider(),
        createAsyncConsumerServicesProvider(),
        createAsyncJetStreamConsumerDepsProvider(),
        ConsumerService,
        JetStreamConsumerService,
        OnEventExplorer,
        RequestReplyConsumerService,
        OnRequestReplyExplorer,
      ],
      exports: [
        ConsumerService,
        JetStreamConsumerService,
        OnEventExplorer,
        RequestReplyConsumerService,
        OnRequestReplyExplorer,
      ],
    };
  }
}
