/** JSON Schema object structure (Draft-07). */
export interface JsonSchemaObject {
  readonly ['$schema']?: string;
  readonly title?: string;
  readonly type?: string;
  readonly properties?: Record<string, unknown>;
  readonly required?: string[];
  readonly examples?: unknown[];
  readonly description?: string;
  readonly [key: string]: unknown;
}

/** Collection of named JSON Schemas keyed by schema reference name. */
export type SchemaCollection = Record<string, JsonSchemaObject>;

/** Entry in the schema manifest index file. */
export interface SchemaManifestEntry {
  /** Relative filename (e.g., 'PaymentProofUploadedEvent.json'). */
  readonly file: string;
  /** SHA-256 hash of the schema JSON content for cache validation. */
  readonly hash: string;
}

/** Schema manifest file structure persisted to disk. */
export interface SchemaManifest {
  /** ISO 8601 timestamp of when the manifest was generated. */
  readonly generatedAt: string;
  /** Directory path where schema files are stored. */
  readonly schemaDir: string;
  /** Index of schema names to their manifest entries. */
  readonly schemas: Record<string, SchemaManifestEntry>;
}
