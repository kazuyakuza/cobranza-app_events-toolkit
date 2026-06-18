import { Injectable, Inject, OnModuleInit, Optional } from '@nestjs/common';
import { DISCOVERY_MODULE_OPTIONS } from './discovery-service-options.interface';
import { DiscoveryModuleOptions } from './discovery.module';
import { ManifestService } from './manifest.service';
import { EventLoggerService } from '../logging/event-logger.service';

/** Handles service manifest registration and heartbeat emission for discovery. */
@Injectable()
export class DiscoveryService implements OnModuleInit {
  private readonly resolvedOptions: DiscoveryModuleOptions;
  private readonly logger: EventLoggerService;

  constructor(
    @Inject(DISCOVERY_MODULE_OPTIONS) options: DiscoveryModuleOptions,
    @Optional() logger: EventLoggerService,
    private readonly manifestService: ManifestService,
  ) {
    this.resolvedOptions = options;
    this.logger = logger ?? new EventLoggerService();
  }

  /** Emits a discovery lifecycle event on startup when the subsystem is enabled and registration is active. */
  onModuleInit(): void {
    if (!this.resolvedOptions.enabled) {
      return;
    }
    if (!this.resolvedOptions.registerOnStartup) {
      return;
    }
    this.manifestService.generateManifest(
      this.resolvedOptions.service ?? { name: 'unknown', version: '0.0.0' },
    );
    this.logger.logEventEmitted({
      eventId: 'discovery-startup',
      eventType: 'discovery.service.initialized',
      subject: 'discovery.lifecycle',
    });
  }
}
