import { SetMetadata } from '@nestjs/common';

/** Metadata key for @OnEvent() decorator. */
export const ON_EVENT_METADATA = 'on_event_metadata';

/** Internal stored metadata shape for @OnEvent. */
export interface OnEventMetadata {
  eventType: string;
  version?: string;
  description?: string;
  tags?: string[];
  payloadSchemaRef?: string;
  payloadExample?: Record<string, unknown>;
}

/** Options for the @OnEvent() method decorator (second argument). */
export interface OnEventOptions {
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
 * Method decorator that marks a handler as an event consumer.
 *
 * Stores subject-building metadata that the OnEventExplorer reads at startup
 * to auto-register the handler with ConsumerService for the matching NATS subject.
 *
 * @example
 * ```ts
 * @OnEvent('payment.proof.uploaded', { version: '1', description: 'Proof was uploaded' })
 * async handleProofUploaded(event: EventEnvelope<PaymentProofUploadedData>) {
 *   // handle event
 * }
 * ```
 */
export function OnEvent(eventType: string, options?: OnEventOptions): MethodDecorator {
  const metadata: OnEventMetadata = { eventType, ...options };
  return SetMetadata(ON_EVENT_METADATA, metadata);
}
