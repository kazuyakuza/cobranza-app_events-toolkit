import type { ConsumerConfig, ConsumerOpts } from 'nats';
import {
  ConsumerSubscribeOpts,
  isConsumerOptsBuilder,
  resolveConsumerSubscribeOpts,
} from './subscribe-options.interface';
import { ModuleConsumerOptions } from './module-consumer-options.interface';

/**
 * Duck-typed interface for extracting resolved `ConsumerOpts` from a NATS `ConsumerOptsBuilder`.
 *
 * The `nats` package's `ConsumerOptsBuilder` exposes a `getOpts()` method that returns the
 * accumulated `ConsumerOpts`. This alias allows the merger to extract the underlying config
 * from a builder without importing the concrete builder type, keeping the dependency surface minimal.
 *
 * @internal
 */
type ConsumerOptsBuilderWithGetOpts = { getOpts(): ConsumerOpts };

/**
 * Merges module-level consumer options with per-subscription options.
 *
 * Precedence (highest first):
 * 1. Per-subscription ConsumerOptsBuilder → full override (returned unchanged).
 * 2. Per-subscription Partial<ConsumerOpts> → spreads over module config.
 * 3. Module scalars → override matching consumerOpts config fields.
 * 4. Module consumerOpts (builder extracted via getOpts() or Partial<ConsumerOpts>).
 * 5. Built-in defaults applied by {@link resolveConsumerSubscribeOpts}.
 */
export function resolveSubscriptionConsumerOpts(
  moduleOptions: ModuleConsumerOptions | undefined,
  perSubscription?: ConsumerSubscribeOpts,
): ConsumerSubscribeOpts {
  if (isConsumerOptsBuilder(perSubscription)) {
    return perSubscription;
  }
  const merged = buildMergedConsumerConfig(moduleOptions, perSubscription);
  return resolveConsumerSubscribeOpts(merged);
}

function buildMergedConsumerConfig(
  moduleOptions: ModuleConsumerOptions | undefined,
  perSubscription: ConsumerSubscribeOpts | undefined,
): Partial<ConsumerOpts> {
  const base = extractBaseConsumerOpts(moduleOptions?.consumerOpts);
  const scalars = moduleOptionsScalarsToConfig(moduleOptions);
  const per = (perSubscription as Partial<ConsumerOpts>) ?? {};
  return {
    config: { ...base.config, ...scalars, ...per.config },
    mack: per.mack ?? base.mack ?? true,
    stream: per.stream ?? base.stream,
  };
}

function extractBaseConsumerOpts(opts: ConsumerSubscribeOpts | undefined): Partial<ConsumerOpts> {
  if (!opts) {
    return {};
  }
  if (isConsumerOptsBuilder(opts)) {
    return (opts as unknown as ConsumerOptsBuilderWithGetOpts).getOpts();
  }
  return opts;
}

function moduleOptionsScalarsToConfig(moduleOptions: ModuleConsumerOptions | undefined): Partial<ConsumerConfig> {
  if (!moduleOptions) {
    return {};
  }
  return {
    ...(moduleOptions.durableName && { durable_name: moduleOptions.durableName }),
    ...(moduleOptions.deliverPolicy !== undefined && { deliver_policy: moduleOptions.deliverPolicy }),
    ...(moduleOptions.ackPolicy !== undefined && { ack_policy: moduleOptions.ackPolicy }),
    ...(moduleOptions.maxDeliver !== undefined && { max_deliver: moduleOptions.maxDeliver }),
    ...(moduleOptions.replayPolicy !== undefined && { replay_policy: moduleOptions.replayPolicy }),
  };
}
