import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import type { SchemaCollection, SchemaManifest, SchemaManifestEntry, JsonSchemaObject } from './schema-types.interface';
import type { ResolvedSchemaGeneratorOptions } from './schema-generator-options.interface';

/** Parameters for persisting a single schema. */
interface PersistSchemaParams {
  readonly name: string;
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
    this.writeManifest(entries);
  }

  /** Persist a single schema and return its manifest entry. */
  persistSchema(params: PersistSchemaParams): SchemaManifestEntry {
    const content = JSON.stringify(params.schema, null, 2);
    const file = `${params.name}.json`;
    writeFileSync(join(this.schemaDir, file), content, 'utf-8');
    return { file, hash: this.computeHash(content) };
  }

  /** Read a single schema from disk, or undefined if not found. */
  readSchema(name: string): Record<string, unknown> | undefined {
    const filePath = join(this.schemaDir, `${name}.json`);
    if (!existsSync(filePath)) return undefined;
    return JSON.parse(readFileSync(filePath, 'utf-8'));
  }

  /** Read the schema manifest index from disk, or undefined if not found. */
  readManifest(): SchemaManifest | undefined {
    const manifestPath = join(this.schemaDir, 'schema-manifest.json');
    if (!existsSync(manifestPath)) return undefined;
    return JSON.parse(readFileSync(manifestPath, 'utf-8'));
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

  private ensureDir(): void {
    if (!existsSync(this.schemaDir)) {
      mkdirSync(this.schemaDir, { recursive: true });
    }
  }

  private writeManifest(entries: Record<string, SchemaManifestEntry>): void {
    const manifest: SchemaManifest = {
      generatedAt: new Date().toISOString(),
      schemaDir: this.schemaDir,
      schemas: entries,
    };
    writeFileSync(join(this.schemaDir, 'schema-manifest.json'), JSON.stringify(manifest, null, 2), 'utf-8');
  }

  private computeHash(content: string): string {
    return createHash('sha256').update(content).digest('hex').slice(0, 16);
  }
}
