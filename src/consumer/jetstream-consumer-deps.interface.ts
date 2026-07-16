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
  /** Optional NATS stream config overrides forwarded to {@link StreamAutoCreator}. */
  streamConfig?: Partial<StreamConfig>;
}
