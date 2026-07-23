import { DynamicModule, Module, Provider, Type } from '@nestjs/common';
import { DiscoveryModule as NestDiscoveryModule } from '@nestjs/core';
import { DISCOVERY_MODULE_OPTIONS, EventsToolkitDiscoveryOptions } from './discovery-service-options.interface';
import { DiscoveryService } from './discovery.service';
import { ManifestService } from './manifest.service';
import { MANIFEST_SERVICE_DEPS_TOKEN } from './manifest-deps.interface';
import { ManifestServiceDepsProvider } from './manifest-deps.provider';
import { SchemaGenerator } from './utils/schema-generator';
import { ServiceInfo } from './service-info.interface';
import { resolveServiceInfo } from './service-info.resolver';
import { DiscoveryEventPublisher } from './events/discovery-event-publisher.service';
import { DiscoveryController } from './discovery.controller';

/**
 * Resolved options used internally by DiscoveryModule providers.
 *
 * The `capabilities` field is populated by `EventsToolkitModule` via
 * {@link resolveCapabilities} (which checks which subsystems are enabled)
 * or passed manually when registering `DiscoveryModule` standalone.
 *
 * @see {@link resolveCapabilities} in `events-toolkit-module.imports.ts`.
 */
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
  service: ServiceInfo;
  /** Directory path for schema persistence. */
  schemaDir: string;
  /** Force schema regeneration on startup. */
  forceRegenerateSchemas: boolean;
  /** Capabilities advertised in the service manifest. */
  capabilities: string[];
}

const DEFAULT_DISCOVERY_OPTIONS = {
  enabled: true as const,
  registerOnStartup: true as const,
  heartbeatIntervalMinutes: 0 as const,
  includeFullManifestInHeartbeat: false as const,
  schemaDir: '.events-toolkit/schemas',
  forceRegenerateSchemas: false as const,
  capabilities: [] as string[],
};

const MANIFEST_DEPS_FACTORY = {
  provide: MANIFEST_SERVICE_DEPS_TOKEN,
  useClass: ManifestServiceDepsProvider,
};

/**
 * Merges user-supplied discovery options with defaults.
 *
 * The `capabilities` array defaults to an empty list when not provided;
 * `EventsToolkitModule` overrides this via {@link resolveCapabilities}
 * before passing options to `DiscoveryModule.forRoot()`.
 *
 * @see {@link resolveCapabilities} in `events-toolkit-module.imports.ts`.
 */
function resolveDiscoveryOptions(userOptions: EventsToolkitDiscoveryOptions): DiscoveryModuleOptions {
  return {
    enabled: userOptions.enabled ?? DEFAULT_DISCOVERY_OPTIONS.enabled,
    registerOnStartup: userOptions.registerOnStartup ?? DEFAULT_DISCOVERY_OPTIONS.registerOnStartup,
    heartbeatIntervalMinutes:
      userOptions.heartbeatIntervalMinutes ?? DEFAULT_DISCOVERY_OPTIONS.heartbeatIntervalMinutes,
    includeFullManifestInHeartbeat:
      userOptions.includeFullManifestInHeartbeat ?? DEFAULT_DISCOVERY_OPTIONS.includeFullManifestInHeartbeat,
    service: resolveServiceInfo(userOptions.service),
    schemaDir: userOptions.schemaDir ?? DEFAULT_DISCOVERY_OPTIONS.schemaDir,
    forceRegenerateSchemas: userOptions.forceRegenerateSchemas ?? DEFAULT_DISCOVERY_OPTIONS.forceRegenerateSchemas,
    capabilities: userOptions.capabilities ?? DEFAULT_DISCOVERY_OPTIONS.capabilities,
  };
}

const SCHEMA_GENERATOR_PROVIDER = {
  provide: SchemaGenerator,
  useFactory: (moduleOptions: DiscoveryModuleOptions): SchemaGenerator =>
    new SchemaGenerator({
      schemaDir: moduleOptions.schemaDir,
      forceRegenerate: moduleOptions.forceRegenerateSchemas,
    }),
  inject: [DISCOVERY_MODULE_OPTIONS],
};

const CORE_DISCOVERY_PROVIDERS: Provider[] = [
  DiscoveryService,
  ManifestService,
  MANIFEST_DEPS_FACTORY,
  SCHEMA_GENERATOR_PROVIDER,
  DiscoveryEventPublisher,
];

const DISCOVERY_EXPORTS: Provider[] = [DiscoveryService, ManifestService, SchemaGenerator, DiscoveryEventPublisher];

function buildDiscoveryDynamicModule(
  providers: Provider[],
  extraImports: Array<Type<unknown> | DynamicModule | Promise<DynamicModule>> = [],
): DynamicModule {
  return {
    module: DiscoveryModule,
    global: true,
    imports: [NestDiscoveryModule, ...extraImports],
    providers,
    exports: DISCOVERY_EXPORTS,
    controllers: [DiscoveryController],
  };
}

function createAsyncOptionsResolver(asyncOptions: DiscoveryModuleAsyncOptions) {
  return async (...args: unknown[]) => resolveDiscoveryOptions(await asyncOptions.useFactory(...args));
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

/**
 * NestJS dynamic module for service discovery and manifest registration.
 *
 * Imports `NestDiscoveryModule` from `@nestjs/core` to make `MetadataScanner`,
 * `DiscoveryService`, and `Reflector` available to `ManifestServiceDepsProvider`.
 */
@Module({})
export class DiscoveryModule {
  /** Registers the discovery module with synchronous options. */
  static forRoot(options: EventsToolkitDiscoveryOptions): DynamicModule {
    const resolvedOptions = resolveDiscoveryOptions(options);
    return buildDiscoveryDynamicModule([
      { provide: DISCOVERY_MODULE_OPTIONS, useValue: resolvedOptions },
      ...CORE_DISCOVERY_PROVIDERS,
    ]);
  }

  /** Registers the discovery module with asynchronous options resolved via a factory. */
  static forRootAsync(asyncOptions: DiscoveryModuleAsyncOptions): DynamicModule {
    return buildDiscoveryDynamicModule(
      [
        {
          provide: DISCOVERY_MODULE_OPTIONS,
          useFactory: createAsyncOptionsResolver(asyncOptions),
          inject: asyncOptions.inject ?? [],
        },
        ...CORE_DISCOVERY_PROVIDERS,
      ],
      asyncOptions.imports ?? [],
    );
  }
}
