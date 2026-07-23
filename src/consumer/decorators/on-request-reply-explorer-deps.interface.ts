import { DiscoveryService, Reflector } from '@nestjs/core';
import { RequestReplyConsumerService } from '../request-reply-consumer.service';
import type { IdempotencyService } from '../../idempotency/idempotency.service';

/** Injection token for {@link OnRequestReplyExplorerDeps}. */
export const ON_REQUEST_REPLY_EXPLORER_DEPS_TOKEN = 'ON_REQUEST_REPLY_EXPLORER_DEPS';

/** Dependencies required by {@link OnRequestReplyExplorer}. */
export interface OnRequestReplyExplorerDeps {
  /** NestJS discovery service for scanning providers and controllers. */
  discovery: DiscoveryService;
  /** NestJS reflector for reading method metadata. */
  reflector: Reflector;
  /** Handler registry for registering discovered request-reply handlers. */
  requestReplyConsumerService: RequestReplyConsumerService;
  /**
   * Idempotency service used to wrap handlers declared with `idempotent: true`.
   * Optional — `undefined` when `IdempotencyModule` is not registered, in which
   * case the `idempotent` flag on `@OnRequestReply()` is silently ignored.
   *
   * @see {@link IdempotencyService} for the deduplication methods.
   */
  idempotencyService?: IdempotencyService;
}
