import { SetMetadata } from '@nestjs/common';
import { EventScope } from '../../common/envelope/event-scope.enum';

/** Metadata key for @OnEvent() decorator. */
export const ON_EVENT_METADATA = 'on_event_metadata';

/** Internal stored metadata shape for @OnEvent. */
export interface OnEventMetadata {
  /** NATS event type identifier (e.g., 'payment.proof.uploaded'). */
  eventType: string;
  /** Major semantic version string (e.g., '1'). */
  version: string;
  /** Human-readable description for discovery manifests. */
  description: string;
  /** Arbitrary tags for categorization in discovery manifests. */
  tags?: string[];
  /** Explicit payload schema reference (e.g., 'PaymentProofUploadedEvent'). */
  payloadSchemaRef?: string;
  /** Example payload object for documentation in discovery manifests. */
  payloadExample: Record<string, unknown>;
  /** Event scope (tenant or global). Defaults to tenant for backward compatibility. */
  scope?: EventScope;
  /**
   * When `true` and `IdempotencyModule` is registered, the explorer wraps this handler
   * with a duplicate check so repeated delivery of the same event is skipped silently.
   * No-op when the idempotency module is not configured.
   *
   * @see {@link IdempotencyService} for the underlying deduplication service.
   * @see {@link OnEventExplorer} for the wrapping logic.
   */
  idempotent?: boolean;
}

/** Options for the @OnEvent() method decorator (second argument, required). */
export interface OnEventOptions {
  /** Major version string (e.g., '1'). Required. */
  version: string;
  /** Human-readable description for discovery manifests. Required. */
  description: string;
  /** Arbitrary tags for categorization in discovery manifests (defaults to []). */
  tags?: string[];
  /** Explicit payload schema reference (e.g., 'PaymentProofUploadedEvent'). */
  payloadSchemaRef?: string;
  /** Example payload object for documentation in discovery manifests. Required. */
  payloadExample: Record<string, unknown>;
  /** Event scope (tenant or global). Defaults to tenant for backward compatibility. */
  scope?: EventScope;
  /**
   * When `true` and `IdempotencyModule` is registered, the explorer wraps this handler
   * with a duplicate check so repeated delivery of the same event is skipped silently.
   * No-op when the idempotency module is not configured.
   *
   * @see {@link IdempotencyService} for the underlying deduplication service.
   * @see {@link OnEventExplorer} for the wrapping logic.
   *
   * @example
   * ```ts
   * @OnEvent('payment.proof.uploaded', {
   *   version: '1',
   *   description: 'Handles payment proof uploads',
   *   payloadExample: { url: 'https://...' },
   *   idempotent: true,
   * })
   * async handlePaymentProof(event: AnyEventEnvelope<PaymentProofUploaded>) { ... }
   * ```
   */
  idempotent?: boolean;
}

/**
 * Method decorator that marks a handler as an event consumer.
 *
 * Stores subject-building metadata that the OnEventExplorer reads at startup
 * to auto-register the handler with ConsumerService for the matching NATS subject.
 *
 * @param eventType - NATS event type identifier (e.g., 'payment.proof.uploaded').
 * @param options - Required metadata options including version, description, and payloadExample.
 * @returns A MethodDecorator that stores on-event metadata via NestJS SetMetadata.
 *
 * @see {@link OnEventExplorer} which reads this metadata at startup to register handlers.
 * @see {@link IdempotencyService} for the deduplication service used when `idempotent: true`.
 */
export function OnEvent(eventType: string, options: OnEventOptions): MethodDecorator {
  const metadata: OnEventMetadata = { eventType, ...options };
  return SetMetadata(ON_EVENT_METADATA, metadata);
}
