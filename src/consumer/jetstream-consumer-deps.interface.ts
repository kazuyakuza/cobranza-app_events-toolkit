import { JetStreamClient, NatsConnection, StreamConfig } from 'nats';
import { ConsumerService } from './consumer.service';
import { EventLoggerService } from '../logging/event-logger.service';

/** Injection token for {@link JetStreamConsumerDeps}. */
export const JETSTREAM_CONSUMER_DEPS_TOKEN = 'JETSTREAM_CONSUMER_DEPS';

/** Dependencies required by {@link JetStreamConsumerService}. */
export interface JetStreamConsumerDeps {
  /** NATS JetStream client for subscribing and publishing to DLQ. */
  jetStream: JetStreamClient;
  /** Handler registry for dispatching consumed events. */
  consumerService: ConsumerService;
  /** Logger for structured event logging. */
  logger: EventLoggerService;
  /** Custom DLQ subject builder. Defaults to prepending `dlq.`. */
  dlqSubjectBuilder?: (subject: string) => string;
  /** NATS connection used to create streams when auto-creation is enabled. */
  connection?: NatsConnection;
  /** When true, auto-create a JetStream stream for each subscribe subject. Default: false. */
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
