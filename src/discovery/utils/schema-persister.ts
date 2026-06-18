import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import type { SchemaCollection, SchemaManifest, SchemaManifestEntry, JsonSchemaObject } from './schema-types.interface';
import type { ResolvedSchemaGeneratorOptions } from './schema-generator-options.interface';

/** Parameters for persisting a single schema. */
interface PersistSchemaParams {
  /** Schema reference name used as the output filename. */
  readonly name: string;
  /** JSON Schema object to persist. */
  readonly schema: JsonSchemaObject;
}

/** Handles reading and writing JSON Schema files to disk. */
export class SchemaPersister {
  private readonly schemaDir: string;

  constructor(options: ResolvedSchemaGeneratorOptions) {
    this.schemaDir = options.schemaDir;
  }

  /** Persist all schemas to disk, writing each to its own file plus a manifest index. */
  persistAll(schemas: SchemaCollection): void {
    this.ensureDir();
    const entries: Record<string, SchemaManifestEntry> = {};
    for (const [name, schema] of Object.entries(schemas)) {
      entries[name] = this.persistSchema({ name, schema });
    }
    const manifest: SchemaManifest = {
      generatedAt: new Date().toISOString(),
      schemaDir: this.schemaDir,
      schemas: entries,
    };
    this.writeManifest(manifest);
  }

  /** Persist a single schema and return its manifest entry. */
  persistSchema(params: PersistSchemaParams): SchemaManifestEntry {
    const file = `${params.name}.json`;
    this.writeJsonFile(join(this.schemaDir, file), params.schema);
    const rawContent = JSON.stringify(params.schema);
    return { file, hash: this.computeHash(rawContent) };
  }

  /** Write the schema manifest index to disk. */
  writeManifest(manifest: SchemaManifest): void {
    this.writeJsonFile(join(this.schemaDir, 'schema-manifest.json'), manifest);
  }

  /** Read a single schema from disk, or undefined if not found. */
  readSchema(name: string): Record<string, unknown> | undefined {
    return this.readJsonFile<Record<string, unknown>>(join(this.schemaDir, `${name}.json`));
  }

  /** Read the schema manifest index from disk, or undefined if not found. */
  readManifest(): SchemaManifest | undefined {
    return this.readJsonFile<SchemaManifest>(join(this.schemaDir, 'schema-manifest.json'));
  }

  /** Check whether a schema file exists on disk. */
  schemaExists(name: string): boolean {
    return existsSync(join(this.schemaDir, `${name}.json`));
  }

  /** Delete all schema files and the manifest from disk. */
  clearAll(): void {
    if (existsSync(this.schemaDir)) {
      rmSync(this.schemaDir, { recursive: true, force: true });
    }
  }

  /** Ensure the schema output directory exists, creating it recursively if needed. */
  private ensureDir(): void {
    if (!existsSync(this.schemaDir)) {
      mkdirSync(this.schemaDir, { recursive: true });
    }
  }

  /** Read and parse a JSON file, returning undefined if it does not exist. */
  private readJsonFile<T>(filePath: string): T | undefined {
    if (!existsSync(filePath)) return undefined;
    try {
      return JSON.parse(readFileSync(filePath, 'utf-8')) as T;
    } catch (error) {
      throw new Error(`Failed to parse schema file ${filePath}: ${(error as Error).message}`);
    }
  }

  /** Serialize content as pretty-printed JSON and write it to the given path. */
  private writeJsonFile(filePath: string, content: unknown): void {
    try {
      writeFileSync(filePath, JSON.stringify(content, null, 2), 'utf-8');
    } catch (error) {
      throw new Error(`Failed to write schema file ${filePath}: ${(error as Error).message}`);
    }
  }

  /** Compute a truncated SHA-256 hex hash for cache validation. */
  private computeHash(content: string): string {
    return createHash('sha256').update(content).digest('hex').slice(0, 16);
  }
}
