import { EventContext } from '../producer/producer.service';

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
export function resolveRequestReplyConfig(
  partial?: Partial<RequestReplyConfig>,
): RequestReplyConfig {
  return {
    defaultTimeoutMs: partial?.defaultTimeoutMs ?? DEFAULT_TIMEOUT_MS,
  };
}

/** Options for sending a request and receiving a typed reply. */
export interface RequestReplyOptions<T> {
  /** NATS subject to send the request to. */
  subject: string;
  /** Domain-specific request payload. */
  data: T;
  /** Metadata context for building the event envelope. */
  context: EventContext;
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