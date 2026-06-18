import { SetMetadata } from '@nestjs/common';

/** Metadata key for @OnEvent() decorator. */
export const ON_EVENT_METADATA = 'on_event_metadata';

/** Options for the @OnEvent() method decorator. */
export interface OnEventOptions {
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
 * Method decorator that marks a handler as an event consumer.
 *
 * Stores subject-building metadata that the OnEventExplorer reads at startup
 * to auto-register the handler with ConsumerService for the matching NATS subject.
 *
 * @example
 * ```ts
 * @OnEvent({ domain: 'payment', entity: 'proof', action: 'uploaded' })
 * async handleProofUploaded(event: EventEnvelope<PaymentProofUploadedData>) {
 *   // handle event
 * }
 * ```
 */
export function OnEvent(options: OnEventOptions): MethodDecorator {
  return SetMetadata(ON_EVENT_METADATA, options);
}
