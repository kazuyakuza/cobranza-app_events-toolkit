import { ActorType } from './actor-type.enum';

/**
 * Common context metadata shared by every event-producing call site.
 *
 * Captures the minimal set of fields needed to build an event envelope
 * without tenancy information. Concrete contexts ({@link EventContext},
 * {@link GlobalEventContext}) add their scope-specific fields.
 *
 * @see docs/event-messaging-convention.md — Section 3 (Event Envelope)
 */
export interface BaseEventContext {
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
