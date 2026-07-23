import { Provider } from '@nestjs/common';
import { IdempotencyService } from '../idempotency/idempotency.service';
import { ConsumerService } from './consumer.service';
import { ON_EVENT_EXPLORER_DEPS_TOKEN } from './decorators/on-event-explorer-deps.interface';
import {
  CONSUMER_DISCOVERY_PAIR_TOKEN,
  DISCOVERY_REFLECTOR_PAIR,
  ConsumerDiscoveryPair,
  DiscoveryReflectorPair,
} from './consumer.module';

/**
 * Intermediate provider that merges DiscoveryReflectorPair with ConsumerService
 * into a single ConsumerDiscoveryPair token.
 *
 * @returns NestJS Provider that produces a {@link ConsumerDiscoveryPair}.
 * @see createOnEventExplorerDepsProvider
 */
export function createConsumerDiscoveryPairProvider(): Provider {
  return {
    provide: CONSUMER_DISCOVERY_PAIR_TOKEN,
    useFactory: (pair: DiscoveryReflectorPair, consumerService: ConsumerService) =>
      ({ ...pair, consumerService }) satisfies ConsumerDiscoveryPair,
    inject: [DISCOVERY_REFLECTOR_PAIR, ConsumerService],
  };
}

/**
 * Provider for `@OnEvent()` explorer dependencies.
 *
 * `idempotencyService` is optional: when `IdempotencyModule` is not
 * registered the dependency resolves to `undefined` and the
 * `idempotent` flag on `@OnEvent()` is a silent no-op.
 *
 * @returns NestJS Provider that produces the deps object consumed by {@link OnEventExplorer}.
 * @see IdempotencyService
 * @see OnEventExplorer
 */
export function createOnEventExplorerDepsProvider(): Provider {
  return {
    provide: ON_EVENT_EXPLORER_DEPS_TOKEN,
    useFactory: (consumerDiscoveryPair: ConsumerDiscoveryPair, idempotencyService?: IdempotencyService) => ({
      ...consumerDiscoveryPair,
      idempotencyService,
    }),
    inject: [CONSUMER_DISCOVERY_PAIR_TOKEN, { token: IdempotencyService, optional: true }],
  };
}
