import { Injectable, OnModuleInit, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { ServiceManifestDto } from '../discovery/dto/service-manifest.dto';
import { ServiceInfo } from '../discovery/service-info.interface';
import { MockManifestService } from './mock-manifest.service';
import { MockDiscoveryEventPublisher } from './mock-discovery-event-publisher.service';
import { ManifestContributor } from '../discovery/manifest-contributor.interface';
import { ManifestContributorMerger } from '../discovery/manifest-contributor.merger';

/** Dependencies injected into MockDiscoveryService. */
export interface MockDiscoveryServiceDeps {
  /** Mock manifest service for generating service manifests. */
  manifestService: MockManifestService;
  /** Mock event publisher for platform discovery events. */
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
 *
 * ## Mock Parity with DiscoveryService
 *
 * This mock maintains behavioral parity with `DiscoveryService` for the
 * `ManifestContributor` pattern:
 *
 * - `registerContributor()` accepts contributors and stores them in registration order.
 * - `generateManifest()` calls `ManifestContributorMerger.merge()` with the same
 *   deduplication semantics as the real service (baseline wins, `subject|type` for
 *   consumes, `subject` for produces).
 * - Contributors registered after `generateManifest()` has cached the manifest will
 *   be included on the next call to `generateManifest()` or `getManifest()`.
 *
 * Use `clear()` to reset the cached manifest and force regeneration with the
 * currently registered contributors.
 */
@Injectable()
export class MockDiscoveryService implements OnModuleInit, OnApplicationBootstrap, OnModuleDestroy {
  private cachedManifest: ServiceManifestDto | null = null;
  private readonly enabled: boolean;
  private readonly serviceInfo: ServiceInfo;
  private readonly manifestService: MockManifestService;
  private readonly eventPublisher: MockDiscoveryEventPublisher;
  private readonly contributors: ManifestContributor[] = [];
  private readonly merger = new ManifestContributorMerger();

  constructor({ manifestService, eventPublisher }: MockDiscoveryServiceDeps, config?: MockDiscoveryServiceConfig) {
    this.manifestService = manifestService;
    this.eventPublisher = eventPublisher;
    this.enabled = config?.enabled ?? true;
    this.serviceInfo = config?.serviceInfo ?? {
      name: 'test-service',
      version: '1.0.0',
    };
  }

  /**
   * Registers a ManifestContributor to add dynamic entries to the service manifest.
   *
   * Mirrors `DiscoveryService.registerContributor()`. Call in the contributor's
   * constructor. Entries are merged on the next `generateManifest()` or `getManifest()` call.
   */
  registerContributor(contributor: ManifestContributor): void {
    this.contributors.push(contributor);
  }

  /** Lifecycle hook: generates manifest on module init when enabled. */
  onModuleInit(): void {
    if (!this.enabled) {
      return;
    }
    this.generateManifest();
  }

  /** Lifecycle hook: publishes registration on application bootstrap. */
  onApplicationBootstrap(): Promise<void> {
    return this.triggerStartup();
  }

  /** Lifecycle hook: publishes shutdown on module destroy. */
  onModuleDestroy(): void {
    void this.triggerShutdown();
  }

  /** Generates and caches the service manifest using MockManifestService and merges contributor entries. */
  generateManifest(): ServiceManifestDto {
    const baseManifest = this.manifestService.generateManifest(this.serviceInfo);
    this.cachedManifest = this.merger.merge(baseManifest, this.contributors);
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
