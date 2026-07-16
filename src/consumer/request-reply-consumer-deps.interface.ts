import { JetStreamClient, NatsConnection, StreamConfig } from 'nats';
import { EventLoggerService } from '../logging/event-logger.service';

/** Injection token for {@link RequestReplyConsumerDeps}. */
export const REQUEST_REPLY_CONSUMER_DEPS_TOKEN = 'REQUEST_REPLY_CONSUMER_DEPS';

/**
 * Dependencies required by {@link RequestReplyConsumerService}.
 */
export interface RequestReplyConsumerDeps {
  /** NATS JetStream client for subscribing to response subjects and publishing to DLQ. */
  jetStream: JetStreamClient;
  /** Logger for structured event logging. */
  logger: EventLoggerService;
  /**
   * NATS subject pattern for subscribing to async response messages.
   * @default 'company.*.response.v1'
   */
  responseSubjectPattern?: string;
  /**
   * Custom Dead Letter Queue subject builder.
   * Defaults to prepending `dlq.` to the original subject.
   */
  dlqSubjectBuilder?: (subject: string) => string;
  /** NATS connection used to create streams when auto-creation is enabled. */
  connection?: NatsConnection;
  /** When true, auto-create a JetStream stream for the response subject pattern. Default: false. */
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
}
