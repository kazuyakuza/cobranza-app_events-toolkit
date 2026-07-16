import { DynamicModule, Module, Type, ForwardReference } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { DiscoveryService, Reflector } from '@nestjs/core';
import { JetStreamClient, NatsConnection, StreamConfig } from 'nats';
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
  createJetStreamAsyncDepsProvider,
  createRequestReplyAsyncDepsProvider,
  resolveJetStreamFromOptions,
} from './consumer-module.providers';

export const CONSUMER_MODULE_OPTIONS = 'CONSUMER_MODULE_OPTIONS';
export const DISCOVERY_REFLECTOR_PAIR = 'DISCOVERY_REFLECTOR_PAIR' as unknown as Type<unknown>;
export const RESOLVED_CONNECTION_TOKEN = 'RESOLVED_CONNECTION' as unknown as Type<unknown>;
export const CONSUMER_SERVICES_PAIR = 'CONSUMER_SERVICES_PAIR' as unknown as Type<unknown>;
export const JETSTREAM_CONSUMER_ASYNC_DEPS_TOKEN = 'JETSTREAM_CONSUMER_ASYNC_DEPS' as unknown as Type<unknown>;
export const REQUEST_REPLY_CONSUMER_ASYNC_DEPS_TOKEN = 'REQUEST_REPLY_CONSUMER_ASYNC_DEPS' as unknown as Type<unknown>;

/** Pair of DiscoveryService and Reflector for explorer-based handler registration. */
export interface DiscoveryReflectorPair {
  discovery: DiscoveryService;
  reflector: Reflector;
}

/** Pair of ConsumerService and EventLoggerService for consumer subsystem injection. */
export interface ConsumerServicesPair {
  consumerService: ConsumerService;
  logger: EventLoggerService;
}

/** Resolved NATS JetStream connection with optional custom DLQ subject builder. */
export interface ResolvedConnection {
  jetStream: JetStreamClient;
  connection?: NatsConnection;
  dlqSubjectBuilder?: (subject: string) => string;
}

/** Combined async deps for JetStream consumer (ResolvedConnection + ConsumerModuleOptions). */
export interface JetStreamAsyncDeps {
  connection: ResolvedConnection;
  moduleOptions: ConsumerModuleOptions;
}

/** Combined async deps for Request-Reply consumer (ResolvedConnection + ConsumerModuleOptions). */
export interface RequestReplyAsyncDeps {
  connection: ResolvedConnection;
  moduleOptions: ConsumerModuleOptions;
}

/** Synchronous options for {@link ConsumerModule.forRoot}. */
export interface ConsumerModuleOptions {
  connection?: NatsConnection;
  jetStream?: JetStreamClient;
  dlqSubjectBuilder?: (subject: string) => string;
  /** NATS subject pattern for request-reply response messages. */
  responseSubjectPattern?: string;
  /** When true, auto-create a JetStream stream for each subscribe subject. Default: false. */
  autoCreateStreams?: boolean;
  /**
   * Optional overrides merged over the auto-creator's default JetStream stream config
   * for every stream created via `autoCreateStreams`.
   *
   * Accepts `Partial<StreamConfig>` from the `nats` package. Any NATS-native stream
   * configuration field can be set — e.g. `max_bytes`, `max_msgs`, `num_replicas`,
   * `max_age`. User-supplied fields take precedence over built-in defaults.
   *
   * Required when the NATS server account mandates `max_bytes` on every stream.
   *
   * @see {@link docs/nats-jetstream-configuration.md} for examples and field reference.
   */
  streamConfig?: Partial<StreamConfig>;
}

/** Asynchronous options for {@link ConsumerModule.forRootAsync}. */
export interface ConsumerModuleAsyncOptions {
  imports?: Array<Type<unknown> | DynamicModule | Promise<DynamicModule> | ForwardReference<unknown>>;
  useFactory: (...args: unknown[]) => Promise<ConsumerModuleOptions> | ConsumerModuleOptions;
  inject?: Array<string | symbol | Type<unknown>>;
}

/**
 * NestJS DynamicModule for event consumption via NATS JetStream.
 *
 * Registers ConsumerService, JetStreamConsumerService, and the
 * RequestReplyConsumerService with automatic handler discovery via
 * @OnEvent() and @OnRequestReply() decorator explorers.
 */
@Module({})
export class ConsumerModule {
  /**
   * Registers the ConsumerModule with synchronously resolved options.
   *
   * @param options - NATS connection and optional DLQ response subject configuration.
   */
  static forRoot(options: ConsumerModuleOptions): DynamicModule {
    const jetStream = resolveJetStreamFromOptions(options);

    return {
      module: ConsumerModule,
      global: true,
      imports: [DiscoveryModule],
      providers: [
        createDiscoveryPairProvider(),
        createOnEventExplorerDepsProvider(),
        createSyncJetStreamConsumerDepsProvider({
          jetStream,
          dlqSubjectBuilder: options.dlqSubjectBuilder,
          connection: options.connection,
          autoCreateStreams: options.autoCreateStreams,
          streamConfig: options.streamConfig,
        }),
        createRequestReplyExplorerDepsProvider(),
        createSyncRequestReplyConsumerDepsProvider({
          jetStream,
          responseSubjectPattern: options.responseSubjectPattern,
          dlqSubjectBuilder: options.dlqSubjectBuilder,
          connection: options.connection,
          autoCreateStreams: options.autoCreateStreams,
          streamConfig: options.streamConfig,
        }),
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

  /**
   * Registers the ConsumerModule with asynchronously resolved options.
   *
   * Use when the NATS connection or configuration depends on other
   * injected providers (e.g. a config service).
   *
   * @param asyncOptions - Factory with optional imports and injection tokens.
   */
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
        createJetStreamAsyncDepsProvider(),
        createRequestReplyAsyncDepsProvider(),
        createAsyncResolvedConnectionProvider(),
        createAsyncConsumerServicesProvider(),
        createAsyncJetStreamConsumerDepsProvider(),
        createAsyncRequestReplyConsumerDepsProvider(),
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
