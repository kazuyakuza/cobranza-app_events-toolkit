import { Provider } from '@nestjs/common';
import { IdempotencyService } from '../idempotency/idempotency.service';
import { RequestReplyConsumerService } from './request-reply-consumer.service';
import { ON_REQUEST_REPLY_EXPLORER_DEPS_TOKEN } from './decorators/on-request-reply-explorer-deps.interface';
import { DISCOVERY_REFLECTOR_PAIR, DiscoveryReflectorPair } from './consumer.module';

export const REQUEST_REPLY_DISCOVERY_PAIR_TOKEN = 'REQUEST_REPLY_DISCOVERY_PAIR';
/** Pair that extends DiscoveryReflectorPair with RequestReplyConsumerService for request-reply explorer deps. */
export interface RequestReplyDiscoveryPair extends DiscoveryReflectorPair {
  requestReplyConsumerService: RequestReplyConsumerService;
}

/**
 * Intermediate provider that merges DiscoveryReflectorPair with
 * RequestReplyConsumerService into a single RequestReplyDiscoveryPair token.
 */
export function createRequestReplyDiscoveryPairProvider(): Provider {
  return {
    provide: REQUEST_REPLY_DISCOVERY_PAIR_TOKEN,
    useFactory: (pair: DiscoveryReflectorPair, requestReplyConsumerService: RequestReplyConsumerService) =>
      ({ ...pair, requestReplyConsumerService }) satisfies RequestReplyDiscoveryPair,
    inject: [DISCOVERY_REFLECTOR_PAIR, RequestReplyConsumerService],
  };
}

/**
 * Provider for @OnRequestReply() explorer dependencies.
 *
 * `idempotencyService` is optional: when IdempotencyModule is not
 * registered the dependency resolves to undefined and the
 * `idempotent` flag on @OnRequestReply() is a silent no-op.
 */
export function createRequestReplyExplorerDepsProvider(): Provider {
  return {
    provide: ON_REQUEST_REPLY_EXPLORER_DEPS_TOKEN,
    useFactory: (requestReplyDiscoveryPair: RequestReplyDiscoveryPair, idempotencyService?: IdempotencyService) => ({
      ...requestReplyDiscoveryPair,
      idempotencyService,
    }),
    inject: [REQUEST_REPLY_DISCOVERY_PAIR_TOKEN, { token: IdempotencyService, optional: true }],
  };
}
