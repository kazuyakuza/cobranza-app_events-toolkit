import { JetStreamClient, NatsConnection } from 'nats';

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
}
