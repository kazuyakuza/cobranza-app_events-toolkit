import { SetMetadata } from '@nestjs/common';
import { EventScope } from '../../common/envelope/event-scope.enum';

/** Metadata key for @EmitEvent() decorator. */
export const EMIT_EVENT_METADATA = 'emit_event_metadata';

/** Internal stored metadata shape for @EmitEvent. */
export interface EmitEventMetadata {
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
}

/** Options for the @EmitEvent() method decorator (second argument, required). */
export interface EmitEventOptions {
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
}

/**
 * Method decorator that marks a handler as an event emitter.
 *
 * Stores subject-building metadata that the EmitEventInterceptor reads
 * to auto-publish the method's return value via ProducerService.emit().
 *
 * @param eventType - NATS event type identifier (e.g., 'payment.proof.uploaded').
 * @param options - Required metadata options including version, description, and payloadExample.
 * @returns A MethodDecorator that stores emit-event metadata via NestJS SetMetadata.
 */
export function EmitEvent(eventType: string, options: EmitEventOptions): MethodDecorator {
  const metadata: EmitEventMetadata = { eventType, ...options };
  return SetMetadata(EMIT_EVENT_METADATA, metadata);
}
