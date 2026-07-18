import { IsString, IsUUID, IsEnum, IsOptional, IsNotEmpty, IsObject, IsISO8601, Matches } from 'class-validator';
import { ActorType } from './actor-type.enum';
import { IsOptionalForSystemActors } from './validators/is-optional-for-system-actors.validator';

/**
 * Common fields shared by every event envelope variant in the Cobranza App platform.
 *
 * Concrete envelope classes ({@link EventEnvelope}, {@link GlobalEventEnvelope})
 * extend this base and add their domain-specific tenancy/scope information.
 *
 * @typeParam T - The domain-specific business payload type.
 *
 * @see docs/event-messaging-convention.md — Section 3 (Event Envelope)
 */
export class BaseEventEnvelope<T = Record<string, unknown>> {
  /**
   * Unique event identifier.
   * Format: UUIDv7 prefixed with `evt_` for human-readable event tracing.
   */
  @IsString()
  @IsNotEmpty()
  @Matches(/^evt_/)
  id!: string;

  /**
   * Event type in dot-notation matching the action part of the NATS subject.
   * Example: `payment.proof.uploaded`
   */
  @IsString()
  @IsNotEmpty()
  type!: string;

  /**
   * Schema version of this event envelope and payload.
   * Semver format recommended: `1.0.0`
   */
  @IsString()
  @IsNotEmpty()
  version!: string;

  /**
   * ISO 8601 UTC timestamp with milliseconds marking when the event was produced.
   * Format: `YYYY-MM-DDTHH:mm:ss.sssZ`
   */
  @IsString()
  @IsNotEmpty()
  @IsISO8601({ strict: true })
  produced_at!: string;

  /**
   * Name of the microservice that produced this event.
   * Use kebab-case: `payment-service`, `debt-service`
   */
  @IsString()
  @IsNotEmpty()
  producer!: string;

  /**
   * Type of actor who performed the action recorded in this event.
   */
  @IsEnum(ActorType)
  actor_type!: ActorType;

  /**
   * Unique identifier of the actor (user_id, client_id, etc.).
   * Required for human actors (`client`, `company_user`); optional for
   * automated actors (`system`, `scheduler`, `external_api`).
   */
  @IsOptionalForSystemActors()
  actor_id?: string;

  /**
   * Identifier shared across all events in a single request/transaction chain.
   * Used for distributed tracing and idempotency.
   */
  @IsUUID('4')
  correlation_id!: string;

  /**
   * Event ID that directly triggered this event (event sourcing chain).
   * Optional — only set when this event is a direct consequence of another.
   */
  @IsOptional()
  @IsUUID('4')
  causation_id?: string;

  /**
   * OpenTelemetry trace ID for cross-service observability.
   * Optional but recommended for production tracing.
   */
  @IsOptional()
  @IsString()
  trace_id?: string;

  /**
   * NATS subject for async request-reply response routing.
   * Optional — only set for request-reply pattern events.
   */
  @IsOptional()
  @IsString()
  reply_to?: string;

  /**
   * Domain-specific business payload.
   * Each microservice validates its own data structure.
   */
  @IsObject()
  data!: T;

  /**
   * Constructs a BaseEventEnvelope with optional partial field initialization.
   *
   * @param properties - Partial envelope fields to initialize.
   *                     Useful for factory functions and plain-to-instance transformation.
   */
  constructor(properties?: Partial<BaseEventEnvelope<T>>) {
    if (properties) {
      Object.assign(this, properties);
    }
  }
}
