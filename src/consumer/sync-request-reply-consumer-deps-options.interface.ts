import { JetStreamClient, NatsConnection, StreamConfig } from 'nats';
import { GatewayConsumerOptions } from './gateway-consumer-options.interface';

/**
 * Options for creating a synchronous Request-Reply consumer dependencies provider.
 * Encapsulates parameters to comply with the ≤2-argument rule.
 */
export interface SyncRequestReplyConsumerDepsOptions {
  /** NATS JetStream client. */
  jetStream: JetStreamClient;
  /** NATS subject pattern for request-reply response messages. */
  responseSubjectPattern?: string;
  /** Custom DLQ subject builder. Defaults to prepending `dlq.`. */
  dlqSubjectBuilder?: (subject: string) => string;
  /** NATS connection used to create streams when auto-creation is enabled. */
  connection?: NatsConnection;
  /** When true, auto-create a JetStream stream for the response subject pattern. */
  autoCreateStreams?: boolean;
  /**
   * Optional overrides merged over the auto-creator's default JetStream stream config.
   *
   * Accepts `Partial<StreamConfig>` from the `nats` package. Any NATS-native stream
   * configuration field can be set — e.g. `max_bytes`, `max_msgs`, `num_replicas`,
   * `max_age`. User-supplied fields take precedence over built-in defaults.
   *
   * Forwarded to {@link StreamAutoCreator} when auto-creating the response subject stream.
   *
   * @see {@link docs/nats-jetstream-configuration.md} for examples and field reference.
   */
  streamConfig?: Partial<StreamConfig>;
  /** Gateway-level JetStream consumer options merged into every subscription. */
  gatewayConsumerOpts?: GatewayConsumerOptions;
}
