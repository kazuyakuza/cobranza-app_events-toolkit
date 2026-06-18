import { Injectable } from '@nestjs/common';
import { ServiceManifestDto } from '../discovery/dto/service-manifest.dto';
import { ServiceInfo } from '../discovery/service-info.interface';
import { generateInstanceId } from '../discovery/instance-id.utils';

/**
 * In-memory mock for ManifestService.
 *
 * Returns a configurable manifest for tests. When no default manifest is set,
 * generates a minimal manifest from the provided ServiceInfo.
 */
@Injectable()
export class MockManifestService {
  private defaultManifest: ServiceManifestDto | null = null;

  /** Implements the same signature as ManifestService for drop-in replacement. */
  generateManifest(serviceInfo: ServiceInfo): ServiceManifestDto {
    if (this.defaultManifest) {
      return { ...this.defaultManifest };
    }
    return this.buildDefaultManifest(serviceInfo);
  }

  /** Sets a pre-configured manifest to return on every generateManifest() call. */
  setDefaultManifest(manifest: ServiceManifestDto): void {
    this.defaultManifest = manifest;
  }

  /** Clears the configured default manifest. */
  clearDefaultManifest(): void {
    this.defaultManifest = null;
  }

  /** Resets all internal state. */
  clear(): void {
    this.defaultManifest = null;
  }

  private buildDefaultManifest(serviceInfo: ServiceInfo): ServiceManifestDto {
    return {
      name: serviceInfo.name,
      version: serviceInfo.version,
      description: serviceInfo.description ?? '',
      instanceId: serviceInfo.instanceId ?? generateInstanceId(),
      consumes: [],
      produces: [],
    };
  }
}
