import { InjectionToken } from '@nestjs/common';
import { IdempotencyRepository } from './idempotency.types';
import { EventLoggerService } from '../logging/event-logger.service';
import { IdempotencyServiceOptions } from './idempotency-service-options.interface';

/** Injection token for IdempotencyService dependencies. */
export const IDEMPOTENCY_SERVICE_DEPS_TOKEN: InjectionToken = 'IDEMPOTENCY_SERVICE_DEPS';

/** Dependencies required by IdempotencyService. */
export interface IdempotencyServiceDeps {
  /** Persistence layer for idempotency keys. */
  repository: IdempotencyRepository;
  /** Structured event logger. */
  logger: EventLoggerService;
  /** Optional service configuration. */
  options?: IdempotencyServiceOptions;
}
