import { SetMetadata } from '@nestjs/common';

/** Metadata key for @EmitEvent() decorator. */
export const EMIT_EVENT_METADATA = 'emit_event_metadata';

/** Options for the @EmitEvent() method decorator. */
export interface EmitEventOptions {
  /** Business domain (e.g. 'payment', 'debt'). */
  domain: string;
  /** Main entity involved (e.g. 'proof', 'statement'). */
  entity: string;
  /** Verb in past tense describing the action (e.g. 'uploaded', 'created'). */
  action: string;
  /** Major version number (default: '1'). */
  version?: string;
  /** Human-readable description for discovery manifests. */
  description?: string;
  /** Arbitrary tags for categorization in discovery manifests. */
  tags?: string[];
  /** Explicit payload schema reference (e.g., 'PaymentProofUploadedEvent'). */
  payloadSchemaRef?: string;
}

/**
 * Method decorator that marks a handler as an event emitter.
 *
 * Stores subject-building metadata that the EmitEventInterceptor reads
 * to auto-publish the method's return value via ProducerService.emit().
 *
 * @example
 * ```ts
 * @EmitEvent({ domain: 'payment', entity: 'proof', action: 'uploaded' })
 * async handleProofUpload(data: ProofData, context: EventContext) {
 *   return new PaymentProofUploadedEvent(data, context);
 * }
 * ```
 */
export function EmitEvent(options: EmitEventOptions): MethodDecorator {
  return SetMetadata(EMIT_EVENT_METADATA, options);
}
