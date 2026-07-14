import { JetStreamClient } from 'nats';

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
}
