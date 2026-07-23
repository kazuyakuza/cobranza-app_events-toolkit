import { Provider, Type } from '@nestjs/common';
import { DiscoveryService, Reflector } from '@nestjs/core';
import { JetStreamClient } from 'nats';
import { EventLoggerService } from '../logging/event-logger.service';
import { ConsumerService } from './consumer.service';
import { JETSTREAM_CONSUMER_DEPS_TOKEN } from './jetstream-consumer-deps.interface';
import { REQUEST_REPLY_CONSUMER_DEPS_TOKEN } from './request-reply-consumer-deps.interface';
import {
  CONSUMER_MODULE_OPTIONS,
  DISCOVERY_REFLECTOR_PAIR,
  RESOLVED_CONNECTION_TOKEN,
  CONSUMER_SERVICES_PAIR,
  JETSTREAM_CONSUMER_ASYNC_DEPS_TOKEN,
  REQUEST_REPLY_CONSUMER_ASYNC_DEPS_TOKEN,
  ConsumerModuleOptions,
  ConsumerModuleAsyncOptions,
  ConsumerServicesPair,
  ResolvedConnection,
  JetStreamAsyncDeps,
  RequestReplyAsyncDeps,
} from './consumer.module';
import { SyncJetStreamConsumerDepsOptions } from './sync-jetstream-consumer-deps-options.interface';
import { SyncRequestReplyConsumerDepsOptions } from './sync-request-reply-consumer-deps-options.interface';

/** Provider for the DiscoveryService + Reflector pair used by explorers. */
export function createDiscoveryPairProvider(): Provider {
  return {
    provide: DISCOVERY_REFLECTOR_PAIR,
    useFactory: (discovery: DiscoveryService, reflector: Reflector) => ({ discovery, reflector }),
    inject: [DiscoveryService, Reflector],
  };
}

/** Provider for JetStream consumer dependencies (sync forRoot variant). */
export function createSyncJetStreamConsumerDepsProvider(options: SyncJetStreamConsumerDepsOptions): Provider {
  return {
    provide: JETSTREAM_CONSUMER_DEPS_TOKEN,
    useFactory: (consumerService: ConsumerService, logger: EventLoggerService) => ({
      jetStream: options.jetStream,
      consumerService,
      logger,
      dlqSubjectBuilder: options.dlqSubjectBuilder,
      connection: options.connection,
      autoCreateStreams: options.autoCreateStreams,
      streamConfig: options.streamConfig,
      moduleConsumerOpts: options.moduleConsumerOpts,
    }),
    inject: [ConsumerService, EventLoggerService],
  };
}

/** Provider for request-reply consumer dependencies (sync forRoot variant). */
export function createSyncRequestReplyConsumerDepsProvider(options: SyncRequestReplyConsumerDepsOptions): Provider {
  return {
    provide: REQUEST_REPLY_CONSUMER_DEPS_TOKEN,
    useFactory: (logger: EventLoggerService) => ({
      jetStream: options.jetStream,
      logger,
      responseSubjectPattern: options.responseSubjectPattern,
      dlqSubjectBuilder: options.dlqSubjectBuilder,
      connection: options.connection,
      autoCreateStreams: options.autoCreateStreams,
      streamConfig: options.streamConfig,
      moduleConsumerOpts: options.moduleConsumerOpts,
    }),
    inject: [EventLoggerService],
  };
}

/** Provider that resolves module options from an async factory. */
export function createAsyncOptionsProvider(asyncOptions: ConsumerModuleAsyncOptions): Provider {
  return {
    provide: CONSUMER_MODULE_OPTIONS,
    useFactory: async (...args: unknown[]): Promise<ConsumerModuleOptions> => asyncOptions.useFactory(...args),
    inject: asyncOptions.inject ?? [],
  };
}

/** Provider that resolves the connection (jetStream + dlqSubjectBuilder) from module options. */
export function createAsyncResolvedConnectionProvider(): Provider {
  return {
    provide: RESOLVED_CONNECTION_TOKEN,
    useFactory: (moduleOptions: ConsumerModuleOptions) => ({
      jetStream: resolveJetStreamFromOptions(moduleOptions),
      connection: moduleOptions.connection,
      dlqSubjectBuilder: moduleOptions.dlqSubjectBuilder,
    }),
    inject: [CONSUMER_MODULE_OPTIONS],
  };
}

/**
 * Resolves a JetStreamClient from the provided module options.
 *
 * Returns `options.jetStream` when supplied directly; otherwise falls back to
 * `options.connection.jetstream()`. Throws when neither is configured.
 *
 * @param options - The resolved ConsumerModuleOptions.
 * @returns A JetStreamClient ready for stream/consumer operations.
 * @throws When neither `jetStream` nor `connection` is present in options.
 */
export function resolveJetStreamFromOptions(options: ConsumerModuleOptions): JetStreamClient {
  if (options.jetStream) return options.jetStream;
  if (options.connection) return options.connection.jetstream();
  throw new Error('ConsumerModule requires either connection or jetStream in options');
}

/** Provider that pairs ConsumerService with EventLoggerService for async setup. */
export function createAsyncConsumerServicesProvider(): Provider {
  return {
    provide: CONSUMER_SERVICES_PAIR,
    useFactory: (consumerService: ConsumerService, logger: EventLoggerService) => ({ consumerService, logger }),
    inject: [ConsumerService, EventLoggerService],
  };
}

function createAsyncCombinedDepsProvider(token: string | symbol | Type<unknown>): Provider {
  return {
    provide: token,
    useFactory: (connection: ResolvedConnection, moduleOptions: ConsumerModuleOptions) => ({
      connection,
      moduleOptions,
    }),
    inject: [RESOLVED_CONNECTION_TOKEN, CONSUMER_MODULE_OPTIONS],
  };
}

/** Provider that combines ResolvedConnection and ConsumerModuleOptions for JetStream async deps. */
export function createJetStreamAsyncDepsProvider(): Provider {
  return createAsyncCombinedDepsProvider(JETSTREAM_CONSUMER_ASYNC_DEPS_TOKEN);
}

/** Provider for JetStream consumer dependencies (async forRootAsync variant). */
export function createAsyncJetStreamConsumerDepsProvider(): Provider {
  return {
    provide: JETSTREAM_CONSUMER_DEPS_TOKEN,
    useFactory: (combined: JetStreamAsyncDeps, services: ConsumerServicesPair) => ({
      jetStream: combined.connection.jetStream,
      consumerService: services.consumerService,
      logger: services.logger,
      dlqSubjectBuilder: combined.connection.dlqSubjectBuilder,
      connection: combined.connection.connection ?? combined.moduleOptions.connection,
      autoCreateStreams: combined.moduleOptions.autoCreateStreams,
      streamConfig: combined.moduleOptions.streamConfig,
      moduleConsumerOpts: combined.moduleOptions.moduleConsumerOpts,
    }),
    inject: [JETSTREAM_CONSUMER_ASYNC_DEPS_TOKEN, CONSUMER_SERVICES_PAIR],
  };
}

/** Provider that combines ResolvedConnection and ConsumerModuleOptions for request-reply async deps. */
export function createRequestReplyAsyncDepsProvider(): Provider {
  return createAsyncCombinedDepsProvider(REQUEST_REPLY_CONSUMER_ASYNC_DEPS_TOKEN);
}

/** Provider for request-reply consumer dependencies (async forRootAsync variant). */
export function createAsyncRequestReplyConsumerDepsProvider(): Provider {
  return {
    provide: REQUEST_REPLY_CONSUMER_DEPS_TOKEN,
    useFactory: (combined: RequestReplyAsyncDeps, logger: EventLoggerService) => ({
      jetStream: combined.connection.jetStream,
      logger,
      responseSubjectPattern: combined.moduleOptions.responseSubjectPattern,
      dlqSubjectBuilder: combined.connection.dlqSubjectBuilder,
      connection: combined.connection.connection ?? combined.moduleOptions.connection,
      autoCreateStreams: combined.moduleOptions.autoCreateStreams,
      streamConfig: combined.moduleOptions.streamConfig,
      moduleConsumerOpts: combined.moduleOptions.moduleConsumerOpts,
    }),
    inject: [REQUEST_REPLY_CONSUMER_ASYNC_DEPS_TOKEN, EventLoggerService],
  };
}
