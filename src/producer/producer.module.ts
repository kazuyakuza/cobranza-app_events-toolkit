import { DynamicModule, Provider } from '@nestjs/common';
import { JetStreamClient } from 'nats';
import { EventLoggerService } from '../logging/event-logger.service';
import { ProducerService } from './producer.service';
import { EmitEventInterceptor } from './decorators/emit-event-interceptor';
import { JETSTREAM_TOKEN, ProducerModuleOptions, ProducerModuleAsyncOptions } from './producer.constants';

const COMMON_PROVIDERS: Provider[] = [EventLoggerService, ProducerService, EmitEventInterceptor];

const COMMON_EXPORTS = [ProducerService, EmitEventInterceptor];

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

function moduleBase(): Pick<DynamicModule, 'module' | 'global' | 'exports'> {
  return {
    module: ProducerModule,
    global: true,
    exports: COMMON_EXPORTS,
  };
}

/** NestJS DynamicModule for event publishing via NATS JetStream. */
export class ProducerModule {
  /**
   * Registers the ProducerModule with synchronously resolved options.
   *
   * @param options - Connection or JetStream instance to use for publishing.
   */
  static forRoot(options: ProducerModuleOptions): DynamicModule {
    const jetStream = resolveJetStream(options);
    return {
      ...moduleBase(),
      providers: [{ provide: JETSTREAM_TOKEN, useValue: jetStream }, ...COMMON_PROVIDERS],
    };
  }

  /**
   * Registers the ProducerModule with asynchronously resolved options.
   *
   * Use this when the JetStream connection depends on other injected providers
   * (e.g. a configuration service or async NATS client factory).
   *
   * @param asyncOptions - Factory and optional injection tokens for deferred resolution.
   */
  static forRootAsync(asyncOptions: ProducerModuleAsyncOptions): DynamicModule {
    if (asyncOptions.useExisting) {
      return {
        ...moduleBase(),
        providers: [...COMMON_PROVIDERS],
      };
    }
    const jetStreamProvider: Provider = {
      provide: JETSTREAM_TOKEN,
      useFactory: async (...args: unknown[]): Promise<JetStreamClient> => {
        const moduleOptions = await asyncOptions.useFactory(...args);
        return resolveJetStream(moduleOptions);
      },
      inject: asyncOptions.inject ?? [],
    };
    return {
      ...moduleBase(),
      providers: [jetStreamProvider, ...COMMON_PROVIDERS],
    };
  }
}
