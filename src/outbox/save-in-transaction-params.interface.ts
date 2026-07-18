import { AnyEventEnvelope } from '../common/envelope/envelope-types';
import { TransactionContext } from './transaction-context.interface';

/** Parameters for persisting an event to the outbox within a database transaction. */
export interface SaveInTransactionParams {
  /** Event envelope to persist (tenant or global). */
  readonly event: AnyEventEnvelope<unknown>;
  /** NATS subject the event will be published to. */
  readonly subject: string;
  /** Transaction context linking the outbox insert to an active transaction. */
  readonly transactionContext: TransactionContext;
}
