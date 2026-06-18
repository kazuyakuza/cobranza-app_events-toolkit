import { DynamicModule, Module, Type } from '@nestjs/common';
import { DISCOVERY_MODULE_OPTIONS, EventsToolkitDiscoveryOptions } from './discovery-service-options.interface';
import { DiscoveryService } from './discovery.service';

/** Resolved options used internally by DiscoveryModule providers. */
export interface DiscoveryModuleOptions {
  /** Whether the discovery subsystem is enabled. */
  enabled: boolean;
  /** Whether to register the service manifest on application startup. */
  registerOnStartup: boolean;
  /** Heartbeat interval in minutes. 0 disables heartbeat. */
  heartbeatIntervalMinutes: number;
  /** Whether to include the full manifest payload in heartbeat messages. */
  includeFullManifestInHeartbeat: boolean;
}

const DEFAULT_DISCOVERY_OPTIONS: DiscoveryModuleOptions = {
  enabled: true,
  registerOnStartup: true,
  heartbeatIntervalMinutes: 0,
  includeFullManifestInHeartbeat: false,
};

function resolveDiscoveryOptions(userOptions: EventsToolkitDiscoveryOptions): DiscoveryModuleOptions {
  return {
    enabled: userOptions.enabled ?? DEFAULT_DISCOVERY_OPTIONS.enabled,
    registerOnStartup: userOptions.registerOnStartup ?? DEFAULT_DISCOVERY_OPTIONS.registerOnStartup,
    heartbeatIntervalMinutes:
      userOptions.heartbeatIntervalMinutes ?? DEFAULT_DISCOVERY_OPTIONS.heartbeatIntervalMinutes,
    includeFullManifestInHeartbeat:
      userOptions.includeFullManifestInHeartbeat ?? DEFAULT_DISCOVERY_OPTIONS.includeFullManifestInHeartbeat,
  };
}

/** Asynchronous options for DiscoveryModule.forRootAsync. */
export interface DiscoveryModuleAsyncOptions {
  /** Additional NestJS modules to import alongside the discovery module. */
  imports?: Array<Type<unknown> | DynamicModule | Promise<DynamicModule>>;
  /** Factory that resolves discovery options at runtime. */
  useFactory: (...args: unknown[]) => EventsToolkitDiscoveryOptions | Promise<EventsToolkitDiscoveryOptions>;
  /** Tokens to inject into the factory function. */
  inject?: Array<string | symbol | Type<unknown>>;
}

/** NestJS dynamic module for service discovery and manifest registration. */
@Module({})
export class DiscoveryModule {
  /** Registers the discovery module with synchronous options. */
  static forRoot(options: EventsToolkitDiscoveryOptions): DynamicModule {
    const resolvedOptions = resolveDiscoveryOptions(options);
    const providers = [{ provide: DISCOVERY_MODULE_OPTIONS, useValue: resolvedOptions }, DiscoveryService];
    const exported = [DiscoveryService];

    return {
      module: DiscoveryModule,
      global: true,
      providers,
      exports: exported,
    };
  }

  /** Registers the discovery module with asynchronous options resolved via a factory. */
  static forRootAsync(asyncOptions: DiscoveryModuleAsyncOptions): DynamicModule {
    const providers = [
      {
        provide: DISCOVERY_MODULE_OPTIONS,
        useFactory: async (...args: unknown[]): Promise<DiscoveryModuleOptions> => {
          const userOptions = await asyncOptions.useFactory(...args);
          return resolveDiscoveryOptions(userOptions);
        },
        inject: asyncOptions.inject ?? [],
      },
      DiscoveryService,
    ];
    const exported = [DiscoveryService];

    return {
      module: DiscoveryModule,
      global: true,
      providers,
      exports: exported,
      imports: asyncOptions.imports ?? [],
    };
  }
}
