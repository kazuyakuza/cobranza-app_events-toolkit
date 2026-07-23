import { InjectionToken } from '@nestjs/common';
import { IdempotencyRepository } from './idempotency.types';
import { EventLoggerService } from '../logging/event-logger.service';
import { IdempotencyServiceOptions } from './idempotency-service-options.interface';

/**
 * Injection token for {@link IdempotencyService} dependencies.
 *
 * @see {@link OutboxServiceDeps} for the analogous outbox deps token.
 */
export const IDEMPOTENCY_SERVICE_DEPS_TOKEN: InjectionToken = 'IDEMPOTENCY_SERVICE_DEPS';

/**
 * Dependencies required by {@link IdempotencyService}.
 *
 * Assembled by {@link IdempotencyModule} from the repository, logger, and
 * optional service options providers.
 *
 * @see {@link OutboxServiceDeps} for the outbox equivalent.
 */
export interface IdempotencyServiceDeps {
  /** Persistence layer for idempotency keys. */
  repository: IdempotencyRepository;
  /** Structured event logger. */
  logger: EventLoggerService;
  /** Optional service configuration (e.g. default TTL). */
  options?: IdempotencyServiceOptions;
}
