import { SetMetadata } from '@nestjs/common';

/** Metadata key for @OnRequestReply() decorator. */
export const ON_REQUEST_REPLY_METADATA = 'on_request_reply_metadata';

/** Options for the @OnRequestReply() method decorator. */
export interface OnRequestReplyOptions {
  /** Dot-notation event type (e.g. 'payment.proof.uploaded'). */
  eventType: string;
  /**
   * Optional tenant identifier.
   * When set, the handler is only dispatched for responses whose
   * `company_id` matches this value.
   */
  companyId?: string;
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
 * @OnRequestReply({ eventType: 'payment.proof.uploaded' })
 * async handleResponse(event: EventEnvelope<PaymentProofData>) {
 *   // handle response
 * }
 * ```
 */
export function OnRequestReply(options: OnRequestReplyOptions): MethodDecorator {
  return SetMetadata(ON_REQUEST_REPLY_METADATA, options);
}
