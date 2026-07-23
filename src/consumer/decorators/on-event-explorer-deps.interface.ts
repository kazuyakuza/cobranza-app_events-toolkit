import { DiscoveryService, Reflector } from '@nestjs/core';
import { ConsumerService } from '../consumer.service';
import type { IdempotencyService } from '../../idempotency/idempotency.service';

/** Injection token for {@link OnEventExplorerDeps}. */
export const ON_EVENT_EXPLORER_DEPS_TOKEN = 'ON_EVENT_EXPLORER_DEPS';

/**
 * Dependencies required by {@link OnEventExplorer}.
 *
 * @see {@link OnEventExplorer} for the consumer that uses these dependencies.
 */
export interface OnEventExplorerDeps {
  /** NestJS discovery service for scanning providers and controllers. */
  discovery: DiscoveryService;
  /** NestJS reflector for reading method metadata. */
  reflector: Reflector;
  /** Handler registry for registering discovered event handlers. */
  consumerService: ConsumerService;
  /**
   * Idempotency service used to wrap handlers declared with `idempotent: true`.
   * Optional — `undefined` when `IdempotencyModule` is not registered, in which
   * case the `idempotent` flag on `@OnEvent()` is silently ignored.
   *
   * @see {@link IdempotencyService} for the deduplication methods.
   */
  idempotencyService?: IdempotencyService;
}
