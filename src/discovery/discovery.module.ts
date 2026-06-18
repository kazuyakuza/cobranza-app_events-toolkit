import { DynamicModule, Module } from '@nestjs/common';
import { DISCOVERY_MODULE_OPTIONS, EventsToolkitDiscoveryOptions } from './discovery-service-options.interface';
import { DiscoveryService } from './discovery.service';

/** Resolved options used internally by DiscoveryModule providers. */
export interface DiscoveryModuleOptions {
  registerOnStartup: boolean;
  heartbeatIntervalMinutes: number;
  includeFullManifestInHeartbeat: boolean;
}

const DEFAULT_DISCOVERY_OPTIONS: DiscoveryModuleOptions = {
  registerOnStartup: true,
  heartbeatIntervalMinutes: 0,
  includeFullManifestInHeartbeat: false,
};

function resolveDiscoveryOptions(userOptions: EventsToolkitDiscoveryOptions): DiscoveryModuleOptions {
  return {
    registerOnStartup: userOptions.registerOnStartup ?? DEFAULT_DISCOVERY_OPTIONS.registerOnStartup,
    heartbeatIntervalMinutes:
      userOptions.heartbeatIntervalMinutes ?? DEFAULT_DISCOVERY_OPTIONS.heartbeatIntervalMinutes,
    includeFullManifestInHeartbeat:
      userOptions.includeFullManifestInHeartbeat ?? DEFAULT_DISCOVERY_OPTIONS.includeFullManifestInHeartbeat,
  };
}

/** NestJS dynamic module for service discovery and manifest registration. */
@Module({})
export class DiscoveryModule {
  static forRoot(options: EventsToolkitDiscoveryOptions): DynamicModule {
    const resolvedOptions = resolveDiscoveryOptions(options);

    return {
      module: DiscoveryModule,
      global: true,
      providers: [{ provide: DISCOVERY_MODULE_OPTIONS, useValue: resolvedOptions }, DiscoveryService],
      exports: [DiscoveryService],
    };
  }
}
