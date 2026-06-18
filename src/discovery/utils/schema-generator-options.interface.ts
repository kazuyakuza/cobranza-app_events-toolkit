/** Options for configuring the SchemaGenerator. */
export interface SchemaGeneratorOptions {
  /** Directory path where schema JSON files are persisted. Default: '.events-toolkit/schemas'. */
  readonly schemaDir?: string;
  /** When true, regenerate all schemas even if cached files exist. Default: false. */
  readonly forceRegenerate?: boolean;
  /** JSON Schema draft version URI for $schema references. Default: 'http://json-schema.org/draft-07/schema#'. */
  readonly schemaDraftUri?: string;
}

/** Resolved options with defaults applied. */
export interface ResolvedSchemaGeneratorOptions {
  readonly schemaDir: string;
  readonly forceRegenerate: boolean;
  readonly schemaDraftUri: string;
}

/** Default option values. */
export const DEFAULT_SCHEMA_GENERATOR_OPTIONS: ResolvedSchemaGeneratorOptions = {
  schemaDir: '.events-toolkit/schemas',
  forceRegenerate: false,
  schemaDraftUri: 'http://json-schema.org/draft-07/schema#',
};
