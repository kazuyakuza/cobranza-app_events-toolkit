import type { EventContext } from '../common/envelope/event-context.interface';
import type { GlobalEventContext } from '../common/envelope/global-event-context.interface';
import type { AnyEventEnvelope, AnyEventContext } from '../common/envelope/envelope-types';

/** Injection token for the NATS connection used by RequestReplyService. */
export const NATS_CONNECTION_TOKEN = 'NatsConnection';

/** Injection token for RequestReplyConfig defaults. */
export const REQUEST_REPLY_CONFIG_TOKEN = 'RequestReplyConfig';

/** Injection token for RequestReplyService dependency bundle. */
export const REQUEST_REPLY_DEPS_TOKEN = 'RequestReplyDeps';

/** Default timeout in milliseconds for request-reply operations. */
const DEFAULT_TIMEOUT_MS = 5000;

/** Configuration for RequestReplyService defaults. */
export interface RequestReplyConfig {
  /** Default timeout in milliseconds for request operations. */
  defaultTimeoutMs: number;
}

/** Resolved configuration with defaults applied. */
export function resolveRequestReplyConfig(partial?: Partial<RequestReplyConfig>): RequestReplyConfig {
  return {
    defaultTimeoutMs: partial?.defaultTimeoutMs ?? DEFAULT_TIMEOUT_MS,
  };
}

/** Optional parameters for the request method. */
export interface RequestReplyRequestOptions {
  /** Timeout in milliseconds (overrides config default). */
  timeoutMs?: number;
}

/** Response received from a request-reply exchange. */
export interface RequestReplyResponse<R> {
  /** Decoded business payload from the reply envelope. */
  data: R;
  /** Raw NATS message bytes for advanced use-cases. */
  raw: Uint8Array;
}

/** Dependencies required by RequestReplyService. */
export interface RequestReplyDeps {
  /** Active NATS connection for request operations. */
  natsConnection: import('nats').NatsConnection;
  /** Producer service for publishing reply events. */
  producerService: import('../producer/producer.service').ProducerService;
  /** Logger for structured event logging. */
  logger: import('../logging/event-logger.service').EventLoggerService;
  /** Service configuration with applied defaults. */
  config: RequestReplyConfig;
}

/** Options for the {@link RequestReplyService.sendRequest} fire-and-forget method. */
export interface SendRequestOptions<T> {
  /** NATS subject to publish the request event to. */
  subject: string;
  /** Domain-specific business payload for the request event. */
  payload: T;
  /** Metadata context for the event envelope (tenant or global). Must include replyTo for async responses. */
  context: EventContext | GlobalEventContext;
}

/** Result of a fire-and-forget request, carrying the correlation tracking identifier. */
export interface SendRequestResult {
  /** correlation_id of the sent request, used to correlate async responses. */
  correlationId: string;
}

/** Options for {@link RequestReplyService.buildResponseEnvelope}. */
export interface BuildResponseEnvelopeOptions<R> {
  /** Original request event whose correlation_id and id are preserved in the response. */
  requestEvent: AnyEventEnvelope<unknown>;
  /** Context for the response event. correlationId and causationId are overridden from requestEvent. */
  responseContext: AnyEventContext;
  /** Domain-specific business payload for the response event. */
  responseData: R;
}
