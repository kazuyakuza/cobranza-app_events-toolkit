import { InjectionToken } from '@nestjs/common';

/** Injection token for OutboxService configuration options. */
export const OUTBOX_SERVICE_OPTIONS_TOKEN: InjectionToken = 'OUTBOX_SERVICE_OPTIONS';

/** Configuration for the OutboxService background processor. */
export interface OutboxServiceOptions {
  /** Enable or disable the outbox processor. Default: true. */
  enabled?: boolean;
  /** Interval in milliseconds between processor polls. Default: 5000. */
  processorIntervalMs?: number;
  /** Maximum retry attempts before routing to DLQ. Default: 3. */
  maxRetries?: number;
  /** Base backoff delay in milliseconds for retry strategy. Default: 1000. */
  retryBackoffBaseMs?: number;
  /** Custom DLQ subject builder. Default: prepends 'dlq.' to the original subject. */
  dlqSubjectBuilder?: (subject: string) => string;
}
