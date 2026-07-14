import { JetStreamClient, NatsConnection } from 'nats';

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
}
