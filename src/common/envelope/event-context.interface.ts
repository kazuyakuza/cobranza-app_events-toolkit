import { ActorType } from './actor-type.enum';

/** Context metadata for building and tracing an event envelope. */
export interface EventContext {
  /** Event type in dot-notation (e.g. `payment.proof.uploaded`). */
  type: string;
  /** Schema version of the event envelope and payload. */
  version: string;
  /** Name of the microservice that produced this event. */
  producer: string;
  /** Company UUID for tenant isolation. */
  companyId: string;
  /** Type of actor who performed the action. */
  actorType: ActorType;
  /** Unique identifier of the actor. */
  actorId: string;
  /** Shared ID for correlation across a request chain. */
  correlationId: string;
  /** ID of the event that directly triggered this event. */
  causationId?: string;
  /** OpenTelemetry trace ID for cross-service observability. */
  traceId?: string;
  /** NATS subject for async request-reply response routing. */
  replyTo?: string;
}
