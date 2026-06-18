import { DiscoveryService, Reflector, MetadataScanner } from '@nestjs/core';

/** Injection token for ManifestServiceDeps. */
export const MANIFEST_SERVICE_DEPS_TOKEN = 'MANIFEST_SERVICE_DEPS';

/** Dependencies required by ManifestService. */
export interface ManifestServiceDeps {
  /** NestJS discovery service for scanning providers and controllers. */
  discovery: DiscoveryService;
  /** NestJS reflector for reading method metadata. */
  reflector: Reflector;
  /** NestJS metadata scanner for enumerating method names. */
  metadataScanner: MetadataScanner;
}
