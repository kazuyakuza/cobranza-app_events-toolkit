import { DynamicModule, Module, Type } from '@nestjs/common';
import { DiscoveryService as NestDiscoveryService, Reflector, MetadataScanner } from '@nestjs/core';
import { DISCOVERY_MODULE_OPTIONS, EventsToolkitDiscoveryOptions } from './discovery-service-options.interface';
import { DiscoveryService } from './discovery.service';
import { ManifestService } from './manifest.service';
import { MANIFEST_SERVICE_DEPS_TOKEN } from './manifest-deps.interface';
import { ServiceInfo } from './service-info.interface';

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
  /** Service identity metadata for the discovery manifest. */
  service?: ServiceInfo;
}

const DEFAULT_DISCOVERY_OPTIONS: DiscoveryModuleOptions = {
  enabled: true,
  registerOnStartup: true,
  heartbeatIntervalMinutes: 0,
  includeFullManifestInHeartbeat: false,
};

const MANIFEST_DEPS_FACTORY = {
  provide: MANIFEST_SERVICE_DEPS_TOKEN,
  useFactory: (discovery: NestDiscoveryService, reflector: Reflector, metadataScanner: MetadataScanner) => ({
    discovery,
    reflector,
    metadataScanner,
  }),
  inject: [NestDiscoveryService, Reflector, MetadataScanner],
};

function resolveDiscoveryOptions(userOptions: EventsToolkitDiscoveryOptions): DiscoveryModuleOptions {
  return {
    enabled: userOptions.enabled ?? DEFAULT_DISCOVERY_OPTIONS.enabled,
    registerOnStartup: userOptions.registerOnStartup ?? DEFAULT_DISCOVERY_OPTIONS.registerOnStartup,
    heartbeatIntervalMinutes:
      userOptions.heartbeatIntervalMinutes ?? DEFAULT_DISCOVERY_OPTIONS.heartbeatIntervalMinutes,
    includeFullManifestInHeartbeat:
      userOptions.includeFullManifestInHeartbeat ?? DEFAULT_DISCOVERY_OPTIONS.includeFullManifestInHeartbeat,
    service: userOptions.service,
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
    const providers = [
      { provide: DISCOVERY_MODULE_OPTIONS, useValue: resolvedOptions },
      DiscoveryService,
      ManifestService,
      MANIFEST_DEPS_FACTORY,
    ];
    const exported = [DiscoveryService, ManifestService];

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
      ManifestService,
      MANIFEST_DEPS_FACTORY,
    ];
    const exported = [DiscoveryService, ManifestService];

    return {
      module: DiscoveryModule,
      global: true,
      providers,
      exports: exported,
      imports: asyncOptions.imports ?? [],
    };
  }
}
