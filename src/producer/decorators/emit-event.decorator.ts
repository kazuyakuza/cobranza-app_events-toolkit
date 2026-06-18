import { SetMetadata } from '@nestjs/common';

/** Metadata key for @EmitEvent() decorator. */
export const EMIT_EVENT_METADATA = 'emit_event_metadata';

/** Internal stored metadata shape for @EmitEvent. */
export interface EmitEventMetadata {
  eventType: string;
  version?: string;
  description?: string;
  tags?: string[];
  payloadSchemaRef?: string;
  payloadExample?: Record<string, unknown>;
}

/** Options for the @EmitEvent() method decorator (second argument). */
export interface EmitEventOptions {
  /** Major version number (default: '1'). */
  version?: string;
  /** Human-readable description for discovery manifests. */
  description?: string;
  /** Arbitrary tags for categorization in discovery manifests. */
  tags?: string[];
  /** Explicit payload schema reference (e.g., 'PaymentProofUploadedEvent'). */
  payloadSchemaRef?: string;
  /** Example payload object for documentation in discovery manifests. */
  payloadExample?: Record<string, unknown>;
}

/**
 * Method decorator that marks a handler as an event emitter.
 *
 * Stores subject-building metadata that the EmitEventInterceptor reads
 * to auto-publish the method's return value via ProducerService.emit().
 *
 * @example
 * ```ts
 * @EmitEvent('payment.proof.uploaded', { version: '1', description: 'Proof was uploaded' })
 * async handleProofUpload(data: ProofData, context: EventContext) {
 *   return new PaymentProofUploadedEvent(data, context);
 * }
 * ```
 */
export function EmitEvent(eventType: string, options?: EmitEventOptions): MethodDecorator {
  const metadata: EmitEventMetadata = { eventType, ...options };
  return SetMetadata(EMIT_EVENT_METADATA, metadata);
}
