import { Injectable, Inject, OnModuleInit, OnApplicationBootstrap, OnModuleDestroy, Optional } from '@nestjs/common';
import { DISCOVERY_MODULE_OPTIONS } from './discovery-service-options.interface';
import { DiscoveryModuleOptions } from './discovery.module';
import { ManifestService } from './manifest.service';
import { SchemaGenerator } from './utils/schema-generator';
import { ServiceManifestDto } from './dto/service-manifest.dto';
import { EventLoggerService } from '../logging/event-logger.service';
import { DiscoveryEventPublisher } from './events/discovery-event-publisher.service';

@Injectable()
export class DiscoveryService implements OnModuleInit, OnApplicationBootstrap, OnModuleDestroy {
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private cachedManifest: ServiceManifestDto | null = null;

  @Inject(DISCOVERY_MODULE_OPTIONS)
  private readonly resolvedOptions: DiscoveryModuleOptions;

  @Optional()
  @Inject(EventLoggerService)
  private readonly logger: EventLoggerService | undefined;

  constructor(
    private readonly manifestService: ManifestService,
    private readonly schemaGenerator: SchemaGenerator,
    private readonly eventPublisher: DiscoveryEventPublisher,
  ) {}

  onModuleInit(): void {
    if (!this.resolvedOptions.enabled) {
      return;
    }
    if (!this.resolvedOptions.registerOnStartup) {
      return;
    }
    const manifest = this.manifestService.generateManifest(this.resolvedOptions.service);
    this.schemaGenerator.generateSchemasForManifest(manifest);
    this.cachedManifest = manifest;
    const resolvedLogger = this.logger ?? new EventLoggerService();
    resolvedLogger.logDiscoveryManifest(manifest as unknown as Record<string, unknown>);
    resolvedLogger.logEventEmitted({
      eventId: 'discovery-startup',
      eventType: 'discovery.service.initialized',
      subject: 'discovery.lifecycle',
    });
  }

  async onApplicationBootstrap(): Promise<void> {
    if (!this.shouldPublishEvents()) {
      return;
    }
    const manifest = this.getOrGenerateManifest();
    await this.eventPublisher.publishRegistration(manifest);
    this.startHeartbeat(manifest);
  }

  onModuleDestroy(): void {
    this.stopHeartbeat();
    if (!this.shouldPublishEvents()) {
      return;
    }
    const manifest = this.cachedManifest;
    if (!manifest) {
      return;
    }
    void this.eventPublisher.publishShutdown(manifest);
  }

  private shouldPublishEvents(): boolean {
    return this.resolvedOptions.enabled && this.resolvedOptions.registerOnStartup;
  }

  private getOrGenerateManifest(): ServiceManifestDto {
    if (this.cachedManifest) {
      return this.cachedManifest;
    }
    this.cachedManifest = this.manifestService.generateManifest(this.resolvedOptions.service);
    return this.cachedManifest;
  }

  private startHeartbeat(manifest: ServiceManifestDto): void {
    const intervalMinutes = this.resolvedOptions.heartbeatIntervalMinutes;
    if (intervalMinutes <= 0) {
      return;
    }
    const intervalMs = intervalMinutes * 60 * 1000;
    this.heartbeatTimer = setInterval(() => {
      void this.emitHeartbeat(manifest);
    }, intervalMs);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private async emitHeartbeat(manifest: ServiceManifestDto): Promise<void> {
    const payloadManifest = this.resolvedOptions.includeFullManifestInHeartbeat
      ? this.getOrGenerateManifest()
      : manifest;
    await this.eventPublisher.publishHeartbeat(payloadManifest);
  }
}
