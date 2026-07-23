import { DiscoveryService, Reflector } from '@nestjs/core';
import { ConsumerService } from '../consumer.service';
import type { IdempotencyService } from '../../idempotency/idempotency.service';

/** Injection token for {@link OnEventExplorerDeps}. */
export const ON_EVENT_EXPLORER_DEPS_TOKEN = 'ON_EVENT_EXPLORER_DEPS';

/** Dependencies required by {@link OnEventExplorer}. */
export interface OnEventExplorerDeps {
  /** NestJS discovery service for scanning providers and controllers. */
  discovery: DiscoveryService;
  /** NestJS reflector for reading method metadata. */
  reflector: Reflector;
  /** Handler registry for registering discovered event handlers. */
  consumerService: ConsumerService;
  /** Idempotency service used to wrap handlers declared with `idempotent: true`.
   *  Optional — undefined when IdempotencyModule is not registered. */
  idempotencyService?: IdempotencyService;
}
