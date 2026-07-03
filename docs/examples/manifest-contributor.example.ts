import { Injectable } from '@nestjs/common';
import { DiscoveryService, ManifestContributor, ManifestConsumeEntry, ManifestProduceEntry } from '@cobranza-apps/events-toolkit';

/**
 * Example ManifestContributor for a generic CRUD gateway that registers
 * dynamic event handlers at runtime.
 *
 * This contributor registers itself with DiscoveryService during construction
 * so that dynamic subjects appear in the service manifest before schema
 * generation and before the platform.service.register.v1 event is published.
 */
@Injectable()
export class CrudSubjectManifestContributor implements ManifestContributor {
  constructor(private readonly discoveryService: DiscoveryService) {
    this.discoveryService.registerContributor(this);
  }

  contributeConsumes(): ManifestConsumeEntry[] {
    return [
      {
        subject: 'company.*.db-gateway.entity.created.v1',
        payloadSchemaRef: 'EntityCreatedData',
        description: 'Consumes generic entity created events',
        version: '1',
        handler: 'handleEntityCreated',
        tags: ['crud', 'entity'],
        payloadExample: { entityId: 'uuid', entityType: 'payment' },
        type: 'event',
      },
    ];
  }

  contributeProduces(): ManifestProduceEntry[] {
    return [];
  }
}
