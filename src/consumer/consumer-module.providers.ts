import { Provider } from '@nestjs/common';
import { DiscoveryService, Reflector } from '@nestjs/core';
import { JetStreamClient } from 'nats';
import { EventLoggerService } from '../logging/event-logger.service';
import { ConsumerService } from './consumer.service';
import { JETSTREAM_CONSUMER_DEPS_TOKEN } from './jetstream-consumer-deps.interface';
import { ON_EVENT_EXPLORER_DEPS_TOKEN } from './decorators/on-event-explorer-deps.interface';
import { ON_REQUEST_REPLY_EXPLORER_DEPS_TOKEN } from './decorators/on-request-reply-explorer-deps.interface';
import { REQUEST_REPLY_CONSUMER_DEPS_TOKEN } from './request-reply-consumer-deps.interface';
import { RequestReplyConsumerService } from './request-reply-consumer.service';
import {
  CONSUMER_MODULE_OPTIONS,
  DISCOVERY_REFLECTOR_PAIR,
  RESOLVED_CONNECTION_TOKEN,
  CONSUMER_SERVICES_PAIR,
  ConsumerModuleOptions,
  ConsumerModuleAsyncOptions,
  DiscoveryReflectorPair,
  ConsumerServicesPair,
  ResolvedConnection,
} from './consumer.module';

/** Provider for the DiscoveryService + Reflector pair used by explorers. */
export function createDiscoveryPairProvider(): Provider {
  return {
    provide: DISCOVERY_REFLECTOR_PAIR,
    useFactory: (discovery: DiscoveryService, reflector: Reflector) => ({ discovery, reflector }),
    inject: [DiscoveryService, Reflector],
  };
}

/** Provider for @OnEvent() explorer dependencies. */
export function createOnEventExplorerDepsProvider(): Provider {
  return {
    provide: ON_EVENT_EXPLORER_DEPS_TOKEN,
    useFactory: (pair: DiscoveryReflectorPair, consumerService: ConsumerService) => ({
      discovery: pair.discovery,
      reflector: pair.reflector,
      consumerService,
    }),
    inject: [DISCOVERY_REFLECTOR_PAIR, ConsumerService],
  };
}

/** Provider for JetStream consumer dependencies (sync forRoot variant). */
export function createSyncJetStreamConsumerDepsProvider(
  jetStream: JetStreamClient,
  dlqSubjectBuilder?: (subject: string) => string,
  connection?: import('nats').NatsConnection,
  autoCreateStreams?: boolean,
): Provider {
  return {
    provide: JETSTREAM_CONSUMER_DEPS_TOKEN,
    useFactory: (consumerService: ConsumerService, logger: EventLoggerService) => ({
      jetStream,
      consumerService,
      logger,
      dlqSubjectBuilder,
      connection,
      autoCreateStreams,
    }),
    inject: [ConsumerService, EventLoggerService],
  };
}

/** Provider for @OnRequestReply() explorer dependencies. */
export function createRequestReplyExplorerDepsProvider(): Provider {
  return {
    provide: ON_REQUEST_REPLY_EXPLORER_DEPS_TOKEN,
    useFactory: (pair: DiscoveryReflectorPair, rrConsumerService: RequestReplyConsumerService) => ({
      discovery: pair.discovery,
      reflector: pair.reflector,
      requestReplyConsumerService: rrConsumerService,
    }),
    inject: [DISCOVERY_REFLECTOR_PAIR, RequestReplyConsumerService],
  };
}

/** Provider for request-reply consumer dependencies (sync forRoot variant). */
export function createSyncRequestReplyConsumerDepsProvider(
  jetStream: JetStreamClient,
  responseSubjectPattern?: string,
  dlqSubjectBuilder?: (subject: string) => string,
): Provider {
  return {
    provide: REQUEST_REPLY_CONSUMER_DEPS_TOKEN,
    useFactory: (logger: EventLoggerService) => ({
      jetStream,
      logger,
      responseSubjectPattern,
      dlqSubjectBuilder,
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

function resolveJetStreamFromOptions(options: ConsumerModuleOptions): JetStreamClient {
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

/** Provider for JetStream consumer dependencies (async forRootAsync variant). */
export function createAsyncJetStreamConsumerDepsProvider(): Provider {
  return {
    provide: JETSTREAM_CONSUMER_DEPS_TOKEN,
    useFactory: (connection: ResolvedConnection, services: ConsumerServicesPair, moduleOptions: ConsumerModuleOptions) => ({
      jetStream: connection.jetStream,
      consumerService: services.consumerService,
      logger: services.logger,
      dlqSubjectBuilder: connection.dlqSubjectBuilder,
      connection: connection.connection ?? moduleOptions.connection,
      autoCreateStreams: moduleOptions.autoCreateStreams,
    }),
    inject: [RESOLVED_CONNECTION_TOKEN, CONSUMER_SERVICES_PAIR, CONSUMER_MODULE_OPTIONS],
  };
}

/** Provider for request-reply consumer dependencies (async forRootAsync variant). */
export function createAsyncRequestReplyConsumerDepsProvider(): Provider {
  return {
    provide: REQUEST_REPLY_CONSUMER_DEPS_TOKEN,
    useFactory: (connection: ResolvedConnection, logger: EventLoggerService, moduleOptions: ConsumerModuleOptions) => ({
      jetStream: connection.jetStream,
      logger,
      responseSubjectPattern: moduleOptions.responseSubjectPattern,
      dlqSubjectBuilder: connection.dlqSubjectBuilder,
    }),
    inject: [RESOLVED_CONNECTION_TOKEN, EventLoggerService, CONSUMER_MODULE_OPTIONS],
  };
}
