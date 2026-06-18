import { existsSync, rmSync } from 'node:fs';
import { SchemaGenerator } from './schema-generator';
import type { ServiceManifestDto } from '../dto/service-manifest.dto';

const SCHEMA_DIR = '.events-toolkit/test-gen-schemas';

function cleanup(): void {
  if (existsSync(SCHEMA_DIR)) {
    rmSync(SCHEMA_DIR, { recursive: true, force: true });
  }
}

function createGenerator(): SchemaGenerator {
  return new SchemaGenerator({ schemaDir: SCHEMA_DIR });
}

function createMinimalManifest(): ServiceManifestDto {
  return {
    service: { name: 'test-service', version: '1.0.0', instanceId: 'test-instance' },
    consumes: [],
    produces: [],
    heartbeatIntervalMinutes: 0,
  };
}

describe('SchemaGenerator', () => {
  beforeEach(() => {
    cleanup();
  });

  afterAll(() => {
    cleanup();
  });

  describe('constructor', () => {
    it('uses default options when none provided', () => {
      const generator = new SchemaGenerator();
      expect(generator).toBeDefined();
    });
  });

  describe('generateAllSchemas', () => {
    it('returns a SchemaCollection', () => {
      const generator = createGenerator();
      const schemas = generator.generateAllSchemas();
      expect(schemas).toBeDefined();
      expect(typeof schemas).toBe('object');
    });
  });

  describe('generateSchemasForManifest', () => {
    it('returns an empty collection for manifest with no refs', () => {
      const generator = createGenerator();
      const manifest = createMinimalManifest();
      const result = generator.generateSchemasForManifest(manifest);
      expect(Object.keys(result).length).toBe(0);
    });
  });

  describe('generateSchema', () => {
    it('returns undefined for non-existent schema name', () => {
      const generator = createGenerator();
      const result = generator.generateSchema('NonExistentClass');
      expect(result).toBeUndefined();
    });
  });

  describe('getSchema', () => {
    it('returns undefined for non-existent schema', () => {
      const generator = createGenerator();
      const result = generator.getSchema('NonExistent');
      expect(result).toBeUndefined();
    });
  });

  describe('getAllSchemas', () => {
    it('returns empty collection when no schemas generated', () => {
      const generator = createGenerator();
      const result = generator.getAllSchemas();
      expect(Object.keys(result).length).toBe(0);
    });
  });

  describe('forceRegenerateAll', () => {
    it('clears cache and regenerates for manifest', () => {
      const generator = createGenerator();
      const manifest = createMinimalManifest();
      const result = generator.forceRegenerateAll(manifest);
      expect(result).toBeDefined();
    });
  });
});
