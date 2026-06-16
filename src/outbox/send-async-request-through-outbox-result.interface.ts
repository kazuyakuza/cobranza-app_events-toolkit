/**
 * Result of an async request sent through the outbox.
 *
 * Carries the correlation tracking identifier for linking
 * async responses back to the original request.
 */
export interface SendAsyncRequestThroughOutboxResult {
  /** correlation_id of the persisted request event. */
  correlationId: string;
}
