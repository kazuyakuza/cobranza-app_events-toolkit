import { Injectable, Inject } from '@nestjs/common';
import { DiscoveryService, Reflector, MetadataScanner } from '@nestjs/core';
import { ManifestServiceDeps } from './manifest-deps.interface';

@Injectable()
export class ManifestServiceDepsProvider implements ManifestServiceDeps {
  @Inject(DiscoveryService)
  readonly discovery: DiscoveryService;

  @Inject(Reflector)
  readonly reflector: Reflector;

  constructor(readonly metadataScanner: MetadataScanner) {}
}
