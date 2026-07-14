import { AckPolicy, consumerOpts, ConsumerOptsBuilder, ConsumerOpts, JsMsg } from 'nats';
import { EventEnvelope } from '../common/envelope/event-envelope.class';
import { EventContext } from '../common/envelope/event-context.interface';
import { EventHandler } from './consumer.service';
import { buildDlqSubject } from '../common/utils/subject.builder';

/** Consumer subscription options accepted by {@link SubscribeOptions}.
 * Plain `Partial<ConsumerOpts>` objects are normalized to guarantee `config.ack_policy`. */
export type ConsumerSubscribeOpts = ConsumerOptsBuilder | Partial<ConsumerOpts>;

/** Returns true when the value is a NATS ConsumerOptsBuilder (duck-typed via `getOpts`). */
export function isConsumerOptsBuilder(value: unknown): value is ConsumerOptsBuilder {
  return typeof (value as { getOpts?: unknown })?.getOpts === 'function';
}

/** Builds the default JetStream consumer options used when none are provided. */
export function createDefaultConsumerOpts(): ConsumerOptsBuilder {
  return consumerOpts().manualAck().ackExplicit();
}

/** Resolves caller consumer options so `ack_policy` is always set, preventing the NATS `ack_policy` undefined crash. */
export function resolveConsumerSubscribeOpts(opts?: ConsumerSubscribeOpts): ConsumerSubscribeOpts {
  if (opts === undefined) {
    return createDefaultConsumerOpts();
  }
  if (isConsumerOptsBuilder(opts)) {
    return opts;
  }
  return ensureValidConsumerConfig(opts);
}

/** Defaults `config.ack_policy` to `AckPolicy.Explicit` for a plain `Partial<ConsumerOpts>` value. */
function ensureValidConsumerConfig(opts: Partial<ConsumerOpts>): Partial<ConsumerOpts> {
  const config = { ack_policy: AckPolicy.Explicit, ...opts.config };
  return { ...opts, config };
}

/** Builds a DLQ subject by delegating to the centralized {@link buildDlqSubject}. */
export function defaultDlqSubjectBuilder(subject: string): string {
  return buildDlqSubject(subject);
}

/** Extracts {@link EventContext} fields from a validated {@link EventEnvelope}. */
export function envelopeToContext(envelope: EventEnvelope<unknown>): EventContext {
  return {
    type: envelope.type,
    version: envelope.version,
    producer: envelope.producer,
    companyId: envelope.company_id,
    actorType: envelope.actor_type,
    actorId: envelope.actor_id,
    correlationId: envelope.correlation_id,
    causationId: envelope.causation_id,
    traceId: envelope.trace_id,
    replyTo: envelope.reply_to,
  };
}

/** Options for subscribing a handler to a NATS JetStream subject. */
export interface SubscribeOptions {
  /** NATS subject pattern to consume (e.g. `company.*.payment.proof.uploaded.v1`). */
  subject: string;
  /** Handler function invoked for each successfully validated event. */
  handler: EventHandler;
  /** NATS JetStream consumer options (e.g. durable name, deliver group, manual ack). */
  consumerOpts?: ConsumerSubscribeOpts;
}

/** Options for creating a validation exception from class-validator errors. */
export interface ValidationErrorOptions {
  errors: import('class-validator').ValidationError[];
  subject: string;
  plain: Record<string, unknown>;
}

/** Options for handling an error during message processing. */
export interface ErrorHandlingOptions {
  error: unknown;
  msg: JsMsg;
  subject: string;
  originalPayload?: Record<string, unknown>;
}

/** Options for routing a failed message to the Dead Letter Queue. */
export interface DlqRoutingOptions {
  exception: import('../common/errors/event-consumer.exception').EventConsumerException;
  msg: JsMsg;
  subject: string;
  originalPayload?: Record<string, unknown>;
}
