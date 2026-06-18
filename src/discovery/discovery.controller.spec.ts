import { DiscoveryController } from './discovery.controller';
import { DiscoveryService } from './discovery.service';
import { SchemaGenerator } from './utils/schema-generator';
import type { ServiceManifestDto } from './dto/service-manifest.dto';
import type { SchemaCollection } from './utils/schema-types.interface';

function createMockManifest(): ServiceManifestDto {
  return {
    name: 'test-service',
    version: '1.0.0',
    description: 'Test service',
    instanceId: 'test-instance',
    consumes: [],
    produces: [],
  };
}

function createMockSchemas(): SchemaCollection {
  return { TestDto: { title: 'TestDto', type: 'object' } };
}

function createMockDiscoveryService(manifest: ServiceManifestDto): DiscoveryService {
  return { getManifest: () => manifest } as unknown as DiscoveryService;
}

function createMockSchemaGenerator(schemas: SchemaCollection): SchemaGenerator {
  return { getAllSchemas: () => schemas } as unknown as SchemaGenerator;
}

describe('DiscoveryController', () => {
  describe('getManifest', () => {
    it('returns the service manifest from DiscoveryService', () => {
      const manifest = createMockManifest();
      const controller = new DiscoveryController(
        createMockDiscoveryService(manifest),
        createMockSchemaGenerator(createMockSchemas()),
      );
      const result = controller.getManifest();
      expect(result).toBe(manifest);
    });
  });

  describe('getSchemas', () => {
    it('returns all schemas from SchemaGenerator', () => {
      const schemas = createMockSchemas();
      const controller = new DiscoveryController(
        createMockDiscoveryService(createMockManifest()),
        createMockSchemaGenerator(schemas),
      );
      const result = controller.getSchemas();
      expect(result).toBe(schemas);
    });
  });
});
