import { ActorType } from './actor-type.enum';

/**
 * Context metadata required to build and trace an event envelope.
 *
 * Captures the minimal set of fields that every event-producing call site
 * must supply so the envelope builder can populate tracing, tenancy,
 * and actor information consistently across all Cobranza App microservices.
 *
 * @see docs/event-messaging-convention.md — Section 3 (Event Envelope)
 * @see EventEnvelope
 */
export interface EventContext {
  /**
   * Event type in dot-notation matching the action part of the NATS subject.
   * Example: `payment.proof.uploaded`
   */
  type: string;

  /**
   * Schema version of the event envelope and payload.
   * Semver format recommended: `1.0.0`
   */
  version: string;

  /**
   * Name of the microservice that produced this event.
   * Use kebab-case: `payment-service`, `debt-service`
   */
  producer: string;

  /**
   * Company UUID with dashes — mandatory for tenant isolation.
   * Format: `550e8400-e29b-41d4-a716-446655440000`
   */
  companyId: string;

  /**
   * Type of actor who performed the action recorded in the event.
   */
  actorType: ActorType;

  /**
   * Unique identifier of the actor (user_id, client_id, etc.).
   * Required for human actors (`client`, `company_user`); optional for
   * automated actors (`system`, `scheduler`, `external_api`).
   */
  actorId?: string;

  /**
   * Identifier shared across all events in a single request/transaction chain.
   * Used for distributed tracing and idempotency.
   */
  correlationId: string;

  /**
   * Event ID that directly triggered this event (event sourcing chain).
   * Optional — only set when this event is a direct consequence of another.
   */
  causationId?: string;

  /**
   * OpenTelemetry trace ID for cross-service observability.
   * Optional but recommended for production tracing.
   */
  traceId?: string;

  /**
   * NATS subject for async request-reply response routing.
   * Optional — only set for request-reply pattern events.
   */
  replyTo?: string;
}
