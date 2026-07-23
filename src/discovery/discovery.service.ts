import { Injectable, Inject, OnModuleInit, OnApplicationBootstrap, OnModuleDestroy, Optional } from '@nestjs/common';
import { DISCOVERY_MODULE_OPTIONS } from './discovery-service-options.interface';
import { DiscoveryModuleOptions } from './discovery.module';
import { ManifestService } from './manifest.service';
import { SchemaGenerator } from './utils/schema-generator';
import { ServiceManifestDto } from './dto/service-manifest.dto';
import { EventLoggerService } from '../logging/event-logger.service';
import { DiscoveryEventPublisher } from './events/discovery-event-publisher.service';
import { ManifestContributor } from './manifest-contributor.interface';
import { ManifestContributorMerger } from './manifest-contributor.merger';

/**
 * Core discovery service that manages the service lifecycle:
 * manifest generation on init, registration and heartbeat publishing on bootstrap,
 * and graceful shutdown publishing on destroy.
 */
@Injectable()
export class DiscoveryService implements OnModuleInit, OnApplicationBootstrap, OnModuleDestroy {
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private cachedManifest: ServiceManifestDto | null = null;
  private readonly contributors: ManifestContributor[] = [];
  private readonly merger = new ManifestContributorMerger();

  @Inject(DISCOVERY_MODULE_OPTIONS)
  private readonly resolvedOptions: DiscoveryModuleOptions;

  @Optional()
  @Inject(EventLoggerService)
  private readonly logger: EventLoggerService | undefined;

  @Inject(ManifestService)
  private readonly manifestService!: ManifestService;

  @Inject(SchemaGenerator)
  private readonly schemaGenerator!: SchemaGenerator;

  constructor(private readonly eventPublisher: DiscoveryEventPublisher) {}

  /**
   * Registers a ManifestContributor to add dynamic entries to the service manifest.
   *
   * Call this method in the constructor of the contributor class (i.e., during DI
   * instantiation) to ensure the contributor is registered before `onModuleInit()`
   * fires. Contributors registered after `onModuleInit()` will not be included in
   * the cached manifest.
   *
   * @param contributor - An object implementing `ManifestContributor` that provides
   *   dynamic consume/produce entries for the service manifest.
   * @see {@link ManifestContributor}
   */
  registerContributor(contributor: ManifestContributor): void {
    this.contributors.push(contributor);
  }

  /** Generates and caches the service manifest, then logs it on module initialization. */
  onModuleInit(): void {
    if (!this.resolvedOptions.enabled) {
      return;
    }
    if (!this.resolvedOptions.registerOnStartup) {
      return;
    }
    const manifest = this.getOrGenerateManifest();
    this.schemaGenerator.generateSchemasForManifest(manifest);
    const resolvedLogger = this.logger ?? new EventLoggerService();
    resolvedLogger.logDiscoveryManifest(manifest as unknown as Record<string, unknown>);
    resolvedLogger.logEventEmitted({
      eventId: 'discovery-startup',
      eventType: 'discovery.service.initialized',
      subject: 'discovery.lifecycle',
    });
  }

  /** Publishes the registration event and starts the periodic heartbeat. */
  async onApplicationBootstrap(): Promise<void> {
    if (!this.shouldPublishEvents()) {
      return;
    }
    const manifest = this.getOrGenerateManifest();
    await this.eventPublisher.publishRegistration(manifest);
    this.startHeartbeat(manifest);
  }

  /** Stops the heartbeat timer and publishes a shutdown event. */
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

  /** Returns the service manifest, generating it on first access if not yet cached. */
  getManifest(): ServiceManifestDto {
    return this.getOrGenerateManifest();
  }

  /** Whether both discovery is enabled and startup registration is active. */
  private shouldPublishEvents(): boolean {
    return this.resolvedOptions.enabled && this.resolvedOptions.registerOnStartup;
  }

  /** Returns the cached manifest or generates and caches a new one. */
  private getOrGenerateManifest(): ServiceManifestDto {
    if (this.cachedManifest) {
      return this.cachedManifest;
    }
    const baseManifest = this.manifestService.generateManifest(this.resolvedOptions.service);
    this.cachedManifest = this.merger.merge(baseManifest, this.contributors);
    const capabilities = this.resolvedOptions.capabilities ?? [];
    if (capabilities.length > 0) {
      this.cachedManifest.capabilities = capabilities;
    }
    return this.cachedManifest;
  }

  /** Starts a periodic heartbeat timer based on the configured interval. */
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

  /** Clears the heartbeat timer if one is running. */
  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  /** Emits a single heartbeat event, optionally including the full manifest. */
  private async emitHeartbeat(manifest: ServiceManifestDto): Promise<void> {
    const payloadManifest = this.resolvedOptions.includeFullManifestInHeartbeat
      ? this.getOrGenerateManifest()
      : manifest;
    await this.eventPublisher.publishHeartbeat(payloadManifest);
  }
}
