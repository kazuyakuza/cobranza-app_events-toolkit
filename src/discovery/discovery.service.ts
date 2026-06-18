import { Injectable, Inject, OnModuleInit, Optional } from '@nestjs/common';
import { DISCOVERY_MODULE_OPTIONS } from './discovery-service-options.interface';
import { DiscoveryModuleOptions } from './discovery.module';
import { ManifestService } from './manifest.service';
import { SchemaGenerator } from './utils/schema-generator';
import { ServiceManifestDto } from './dto/service-manifest.dto';
import { EventLoggerService } from '../logging/event-logger.service';

/** Handles service manifest registration and heartbeat emission for discovery. */
@Injectable()
export class DiscoveryService implements OnModuleInit {
  @Inject(DISCOVERY_MODULE_OPTIONS)
  private readonly resolvedOptions: DiscoveryModuleOptions;

  @Optional()
  @Inject(EventLoggerService)
  private readonly logger: EventLoggerService | undefined;

  constructor(
    private readonly manifestService: ManifestService,
    private readonly schemaGenerator: SchemaGenerator,
  ) {}

  /** Emits a discovery lifecycle event on startup when the subsystem is enabled and registration is active. */
  onModuleInit(): void {
    if (!this.resolvedOptions.enabled) {
      return;
    }
    if (!this.resolvedOptions.registerOnStartup) {
      return;
    }
    const manifest: ServiceManifestDto = this.manifestService.generateManifest(
      this.resolvedOptions.service ?? { name: 'unknown', version: '0.0.0' },
    );
    this.schemaGenerator.generateSchemasForManifest(manifest);
    const resolvedLogger = this.logger ?? new EventLoggerService();
    resolvedLogger.logDiscoveryManifest(manifest as unknown as Record<string, unknown>);
    resolvedLogger.logEventEmitted({
      eventId: 'discovery-startup',
      eventType: 'discovery.service.initialized',
      subject: 'discovery.lifecycle',
    });
  }
}
