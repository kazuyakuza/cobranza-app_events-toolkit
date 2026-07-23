import { InjectionToken } from '@nestjs/common';

/**
 * Injection token for {@link IdempotencyService} configuration options.
 *
 * @see {@link OutboxServiceOptions} for the analogous outbox configuration token.
 */
export const IDEMPOTENCY_SERVICE_OPTIONS_TOKEN: InjectionToken = 'IDEMPOTENCY_SERVICE_OPTIONS';

/**
 * Configuration for the {@link IdempotencyService}.
 *
 * @see {@link OutboxServiceOptions} for the outbox equivalent.
 */
export interface IdempotencyServiceOptions {
  /**
   * Default TTL in seconds applied when callers omit `ttlSeconds` on
   * {@link IdempotencyService.markAsProcessed} or
   * {@link IdempotencyService.executeIfNotProcessed}.
   *
   * When omitted, keys never expire.
   */
  defaultTtlSeconds?: number;
}
