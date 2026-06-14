import { OutboxEntry } from './outbox.types';

/** Parameters for building an outbox error log context. */
export interface OutboxErrorContextParams {
  /** Outbox entry being processed. */
  entry: OutboxEntry;
  /** Current delivery attempt number. */
  attempt: number;
  /** Error that occurred during processing. */
  error: unknown;
}
