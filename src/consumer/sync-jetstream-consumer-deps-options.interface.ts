import { JetStreamClient, NatsConnection, StreamConfig } from 'nats';

/**
 * Options for creating a synchronous JetStream consumer dependencies provider.
 * Encapsulates parameters to comply with the ≤2-argument rule.
 */
export interface SyncJetStreamConsumerDepsOptions {
  /** NATS JetStream client. */
  jetStream: JetStreamClient;
  /** Custom DLQ subject builder. Defaults to prepending `dlq.`. */
  dlqSubjectBuilder?: (subject: string) => string;
  /** NATS connection used to create streams when auto-creation is enabled. */
  connection?: NatsConnection;
  /** When true, auto-create a JetStream stream for each subscribe subject. */
  autoCreateStreams?: boolean;
  /**
   * Optional overrides merged over the auto-creator's default JetStream stream config.
   *
   * Accepts `Partial<StreamConfig>` from the `nats` package. Any NATS-native stream
   * configuration field can be set — e.g. `max_bytes`, `max_msgs`, `num_replicas`,
   * `max_age`. User-supplied fields take precedence over built-in defaults.
   *
   * Forwarded to {@link StreamAutoCreator} when auto-creating streams.
   *
   * @see {@link docs/nats-jetstream-configuration.md} for examples and field reference.
   */
  streamConfig?: Partial<StreamConfig>;
}
