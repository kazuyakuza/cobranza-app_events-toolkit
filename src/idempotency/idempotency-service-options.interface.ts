import { InjectionToken } from '@nestjs/common';

/** Injection token for IdempotencyService configuration options. */
export const IDEMPOTENCY_SERVICE_OPTIONS_TOKEN: InjectionToken = 'IDEMPOTENCY_SERVICE_OPTIONS';

/** Configuration for the IdempotencyService. */
export interface IdempotencyServiceOptions {
  /** Default TTL in seconds applied when callers omit ttlSeconds. */
  defaultTtlSeconds?: number;
}
