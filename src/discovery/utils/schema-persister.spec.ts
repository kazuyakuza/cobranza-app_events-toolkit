import { existsSync, readFileSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { SchemaPersister } from './schema-persister';
import type { ResolvedSchemaGeneratorOptions } from './schema-generator-options.interface';
import type { SchemaCollection, SchemaManifest } from './schema-types.interface';

const TEST_DIR = join('.events-toolkit', 'test-schemas');

const testOptions: ResolvedSchemaGeneratorOptions = {
  schemaDir: TEST_DIR,
  forceRegenerate: false,
  schemaDraftUri: 'http://json-schema.org/draft-07/schema#',
};

function createPersister(): SchemaPersister {
  return new SchemaPersister(testOptions);
}

function cleanup(): void {
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true, force: true });
  }
}

describe('SchemaPersister', () => {
  beforeEach(() => {
    cleanup();
  });

  afterAll(() => {
    cleanup();
  });

  describe('persistAll', () => {
    it('creates directory and writes schema files', () => {
      const schemas: SchemaCollection = {
        TestSchema: { $schema: testOptions.schemaDraftUri, title: 'TestSchema', type: 'object' },
      };
      const persister = createPersister();
      persister.persistAll(schemas);
      expect(existsSync(join(TEST_DIR, 'TestSchema.json'))).toBe(true);
    });

    it('writes schema-manifest.json with correct structure', () => {
      const schemas: SchemaCollection = {
        TestSchema: { $schema: testOptions.schemaDraftUri, title: 'TestSchema', type: 'object' },
      };
      const persister = createPersister();
      persister.persistAll(schemas);
      const manifestPath = join(TEST_DIR, 'schema-manifest.json');
      expect(existsSync(manifestPath)).toBe(true);
      const manifest: SchemaManifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
      expect(manifest.schemaDir).toBe(TEST_DIR);
      expect(manifest.generatedAt).toBeDefined();
      expect(manifest.schemas.TestSchema).toBeDefined();
      expect(manifest.schemas.TestSchema.file).toBe('TestSchema.json');
      expect(manifest.schemas.TestSchema.hash).toBeDefined();
    });
  });

  describe('persistSchema', () => {
    it('writes an individual schema file and returns manifest entry', () => {
      const persister = createPersister();
      mkdirSync(TEST_DIR, { recursive: true });
      const entry = persister.persistSchema({
        name: 'MySchema',
        schema: { $schema: testOptions.schemaDraftUri, title: 'MySchema', type: 'object' },
      });
      expect(entry.file).toBe('MySchema.json');
      expect(entry.hash).toBeDefined();
      expect(entry.hash.length).toBe(16);
      expect(existsSync(join(TEST_DIR, 'MySchema.json'))).toBe(true);
    });
  });

  describe('readSchema', () => {
    it('returns undefined for non-existent schema', () => {
      const persister = createPersister();
      expect(persister.readSchema('NonExistent')).toBeUndefined();
    });

    it('returns parsed schema for existing file', () => {
      const persister = createPersister();
      mkdirSync(TEST_DIR, { recursive: true });
      persister.persistSchema({ name: 'Existing', schema: { title: 'Existing', type: 'object' } });
      const result = persister.readSchema('Existing');
      expect(result).toBeDefined();
      expect(result?.title).toBe('Existing');
    });
  });

  describe('readManifest', () => {
    it('returns undefined when no manifest exists', () => {
      const persister = createPersister();
      expect(persister.readManifest()).toBeUndefined();
    });
  });

  describe('schemaExists', () => {
    it('checks file existence correctly', () => {
      const persister = createPersister();
      mkdirSync(TEST_DIR, { recursive: true });
      expect(persister.schemaExists('SomeSchema')).toBe(false);
      persister.persistSchema({ name: 'SomeSchema', schema: { type: 'object' } });
      expect(persister.schemaExists('SomeSchema')).toBe(true);
    });
  });

  describe('clearAll', () => {
    it('removes the schema directory', () => {
      const persister = createPersister();
      mkdirSync(TEST_DIR, { recursive: true });
      expect(existsSync(TEST_DIR)).toBe(true);
      persister.clearAll();
      expect(existsSync(TEST_DIR)).toBe(false);
    });
  });
});
