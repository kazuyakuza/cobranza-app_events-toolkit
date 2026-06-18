import { Injectable } from '@nestjs/common';
import { ServiceManifestDto } from '../discovery/dto/service-manifest.dto';
import { ServiceInfo } from '../discovery/service-info.interface';
import { MockManifestService } from './mock-manifest.service';
import { MockDiscoveryEventPublisher } from './mock-discovery-event-publisher.service';

/** Dependencies injected into MockDiscoveryService. */
export interface MockDiscoveryServiceDeps {
  manifestService: MockManifestService;
  eventPublisher: MockDiscoveryEventPublisher;
}

/** Configuration for the mock discovery service. */
export interface MockDiscoveryServiceConfig {
  /** Whether discovery is enabled. Default: true. */
  enabled?: boolean;
  /** Service identity for manifest generation. */
  serviceInfo?: ServiceInfo;
}

/**
 * In-memory mock for DiscoveryService.
 *
 * Provides explicit trigger methods instead of auto-running NestJS lifecycle
 * hooks, giving tests full control over when startup, heartbeat, and shutdown
 * events are published.
 */
@Injectable()
export class MockDiscoveryService {
  private cachedManifest: ServiceManifestDto | null = null;
  private readonly enabled: boolean;
  private readonly serviceInfo: ServiceInfo;
  private readonly manifestService: MockManifestService;
  private readonly eventPublisher: MockDiscoveryEventPublisher;

  constructor({ manifestService, eventPublisher }: MockDiscoveryServiceDeps, config?: MockDiscoveryServiceConfig) {
    this.manifestService = manifestService;
    this.eventPublisher = eventPublisher;
    this.enabled = config?.enabled ?? true;
    this.serviceInfo = config?.serviceInfo ?? {
      name: 'test-service',
      version: '1.0.0',
    };
  }

  /** Generates and caches the service manifest using MockManifestService. */
  generateManifest(): ServiceManifestDto {
    this.cachedManifest = this.manifestService.generateManifest(this.serviceInfo);
    return this.cachedManifest;
  }

  /** Returns the cached manifest, generating one if not yet cached. */
  getManifest(): ServiceManifestDto {
    if (this.cachedManifest) {
      return this.cachedManifest;
    }
    return this.generateManifest();
  }

  /** Simulates application startup: generates manifest and publishes registration event. */
  async triggerStartup(): Promise<void> {
    if (!this.enabled) {
      return;
    }
    const manifest = this.getManifest();
    await this.eventPublisher.publishRegistration(manifest);
  }

  /** Simulates a single heartbeat event. */
  async triggerHeartbeat(): Promise<void> {
    if (!this.enabled) {
      return;
    }
    const manifest = this.getManifest();
    await this.eventPublisher.publishHeartbeat(manifest);
  }

  /** Simulates graceful shutdown: publishes shutdown event. */
  async triggerShutdown(): Promise<void> {
    if (!this.enabled) {
      return;
    }
    const manifest = this.cachedManifest;
    if (!manifest) {
      return;
    }
    await this.eventPublisher.publishShutdown(manifest);
  }

  /** Resets all internal state including cached manifest. */
  clear(): void {
    this.cachedManifest = null;
  }
}
