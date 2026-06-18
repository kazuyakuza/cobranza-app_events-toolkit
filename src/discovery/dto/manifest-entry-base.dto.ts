/** Base fields shared by all manifest entries (consume and produce). */
export interface ManifestEntryBase {
  /** NATS subject pattern (wildcard for consumers, template for producers). */
  subject: string;
  /** Reference to the payload schema (e.g., class name of the event data type). */
  payloadSchemaRef: string;
  /** Human-readable description of what this entry represents. */
  description: string;
  /** Version string for this entry's subject format (e.g., '1'). */
  version: string;
  /** Name of the handler or producer method. */
  handler: string;
  /** Arbitrary tags for categorization and filtering. */
  tags: string[];
  /** Example payload object for documentation in discovery manifests. */
  payloadExample?: Record<string, unknown>;
}
