import { SetMetadata } from '@nestjs/common';

/** Metadata key for @OnRequestReply() decorator. */
export const ON_REQUEST_REPLY_METADATA = 'on_request_reply_metadata';

/** Internal stored metadata shape for @OnRequestReply. */
export interface OnRequestReplyMetadata {
  /** Event type identifier for the request-reply subject (e.g., 'payment.proof.uploaded'). */
  eventType: string;
  /** Optional tenant identifier to filter responses by company_id. */
  companyId?: string;
  /** Human-readable description for discovery manifests. */
  description?: string;
  /** Arbitrary tags for categorization in discovery manifests. */
  tags?: string[];
  /** Explicit payload schema reference (e.g., 'PaymentProofUploadedData'). */
  payloadSchemaRef?: string;
  /** Example payload object for documentation in discovery manifests. */
  payloadExample?: Record<string, unknown>;
}

/** Options for the @OnRequestReply() method decorator (second argument). */
export interface OnRequestReplyOptions {
  /**
   * Optional tenant identifier.
   * When set, the handler is only dispatched for responses whose
   * `company_id` matches this value.
   */
  companyId?: string;
  /** Human-readable description for discovery manifests. */
  description?: string;
  /** Arbitrary tags for categorization in discovery manifests. */
  tags?: string[];
  /** Explicit payload schema reference (e.g., 'PaymentProofUploadedData'). */
  payloadSchemaRef?: string;
  /** Example payload object for documentation in discovery manifests. */
  payloadExample?: Record<string, unknown>;
}

/**
 * Method decorator that marks a handler to receive async request-reply responses.
 *
 * Stores metadata that the {@link OnRequestReplyExplorer} reads at startup
 * to auto-register the handler with {@link RequestReplyConsumerService}
 * for the matching event type.
 *
 * @example
 * ```ts
 * @OnRequestReply('payment.proof.uploaded', { companyId: '550e8400-e29b-41d4-a716-446655440000' })
 * async handleResponse(event: EventEnvelope<PaymentProofData>) {
 *   // handle response
 * }
 * ```
 */
export function OnRequestReply(eventType: string, options?: OnRequestReplyOptions): MethodDecorator {
  const metadata: OnRequestReplyMetadata = { eventType, ...options };
  return SetMetadata(ON_REQUEST_REPLY_METADATA, metadata);
}
