import { SetMetadata } from '@nestjs/common';

/** Metadata key for @OnRequestReply() decorator. */
export const ON_REQUEST_REPLY_METADATA = 'on_request_reply_metadata';

/** Internal stored metadata shape for @OnRequestReply. */
export interface OnRequestReplyMetadata {
  /** Event type identifier for the request-reply subject (e.g., 'payment.proof.uploaded'). */
  eventType: string;
  /** Optional tenant identifier to filter responses by company_id. */
  companyId?: string;
  /** Human-readable description for discovery manifests. Required. */
  description: string;
  /** Arbitrary tags for categorization in discovery manifests. */
  tags?: string[];
  /** Explicit payload schema reference (e.g., 'PaymentProofUploadedData'). */
  payloadSchemaRef?: string;
  /** Example payload object for documentation in discovery manifests. Required. */
  payloadExample: Record<string, unknown>;
  /**
   * When `true` and `IdempotencyModule` is registered, the explorer wraps this handler
   * with a duplicate check so repeated delivery of the same event is skipped silently.
   * No-op when the idempotency module is not configured.
   *
   * @see {@link IdempotencyService} for the underlying deduplication service.
   * @see {@link OnRequestReplyExplorer} for the wrapping logic.
   */
  idempotent?: boolean;
}

/** Options for the @OnRequestReply() method decorator (second argument, required). */
export interface OnRequestReplyOptions {
  /**
   * Optional tenant identifier.
   * When set, the handler is only dispatched for responses whose
   * `company_id` matches this value.
   */
  companyId?: string;
  /** Human-readable description for discovery manifests. Required. */
  description: string;
  /** Arbitrary tags for categorization in discovery manifests (defaults to []). */
  tags?: string[];
  /** Explicit payload schema reference (e.g., 'PaymentProofUploadedData'). */
  payloadSchemaRef?: string;
  /** Example payload object for documentation in discovery manifests. Required. */
  payloadExample: Record<string, unknown>;
  /**
   * When `true` and `IdempotencyModule` is registered, the explorer wraps this handler
   * with a duplicate check so repeated delivery of the same event is skipped silently.
   * No-op when the idempotency module is not configured.
   *
   * @see {@link IdempotencyService} for the underlying deduplication service.
   * @see {@link OnRequestReplyExplorer} for the wrapping logic.
   *
   * @example
   * ```ts
   * @OnRequestReply('payment.proof.uploaded', {
   *   companyId: '550e8400-e29b-41d4-a716-446655440000',
   *   description: 'Handles upload responses',
   *   payloadExample: { proofId: 'uuid' },
   *   idempotent: true,
   * })
   * async handleResponse(event: EventEnvelope<PaymentProofData>) {
   *   // handle response
   * }
   * ```
   */
  idempotent?: boolean;
}

/**
 * Method decorator that marks a handler to receive async request-reply responses.
 *
 * Stores metadata that the {@link OnRequestReplyExplorer} reads at startup
 * to auto-register the handler with {@link RequestReplyConsumerService}
 * for the matching event type.
 *
 * @param eventType - Event type identifier for the request-reply subject (e.g., 'payment.proof.uploaded').
 * @param options - Required metadata options including description and payloadExample; optional companyId filter.
 * @returns A MethodDecorator that stores on-request-reply metadata via NestJS SetMetadata.
 *
 * @see {@link OnRequestReplyExplorer} which reads this metadata at startup to register handlers.
 * @see {@link IdempotencyService} for the deduplication service used when `idempotent: true`.
 *
 * @example
 * ```ts
 * @OnRequestReply('payment.proof.uploaded', {
 *   companyId: '550e8400-e29b-41d4-a716-446655440000',
 *   description: 'Handles upload responses',
 *   payloadExample: { proofId: 'uuid' },
 * })
 * async handleResponse(event: EventEnvelope<PaymentProofData>) {
 *   // handle response
 * }
 * ```
 */
export function OnRequestReply(eventType: string, options: OnRequestReplyOptions): MethodDecorator {
  const metadata: OnRequestReplyMetadata = { eventType, ...options };
  return SetMetadata(ON_REQUEST_REPLY_METADATA, metadata);
}
