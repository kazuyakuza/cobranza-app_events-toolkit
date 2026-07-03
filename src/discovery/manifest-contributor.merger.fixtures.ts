import { ManifestContributor } from './manifest-contributor.interface';
import { ServiceManifestDto } from './dto/service-manifest.dto';
import { ManifestConsumeEntry } from './dto/manifest-consume-entry.dto';
import { ManifestProduceEntry } from './dto/manifest-produce-entry.dto';

export function createMockManifest(overrides: Partial<ServiceManifestDto> = {}): ServiceManifestDto {
  return {
    name: 'test-service',
    version: '1.0.0',
    description: 'Test service',
    instanceId: 'test-instance',
    consumes: [],
    produces: [],
    ...overrides,
  };
}

export function createConsumeEntry(overrides: Partial<ManifestConsumeEntry> = {}): ManifestConsumeEntry {
  return {
    subject: 'company.*.test.event.v1',
    payloadSchemaRef: 'TestData',
    description: 'Test consume entry',
    version: '1',
    handler: 'handleTest',
    tags: [],
    payloadExample: {},
    type: 'event',
    ...overrides,
  };
}

export function createProduceEntry(overrides: Partial<ManifestProduceEntry> = {}): ManifestProduceEntry {
  return {
    subject: 'company.{companyId}.test.event.v1',
    payloadSchemaRef: 'TestData',
    description: 'Test produce entry',
    version: '1',
    handler: 'emitTest',
    tags: [],
    payloadExample: {},
    ...overrides,
  };
}

export function createContributor(
  consumes: ManifestConsumeEntry[],
  produces: ManifestProduceEntry[],
): ManifestContributor {
  return {
    contributeConsumes: () => consumes,
    contributeProduces: () => produces,
  };
}
