import type { ConsumerConfig, ConsumerOpts } from 'nats';
import {
  ConsumerSubscribeOpts,
  isConsumerOptsBuilder,
  resolveConsumerSubscribeOpts,
} from './subscribe-options.interface';
import { GatewayConsumerOptions } from './gateway-consumer-options.interface';

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
 * Merges gateway-level consumer options with per-subscription options.
 *
 * Precedence (highest first):
 * 1. Per-subscription ConsumerOptsBuilder → full override (returned unchanged).
 * 2. Per-subscription Partial<ConsumerOpts> → spreads over gateway config.
 * 3. Gateway scalars → override matching consumerOpts config fields.
 * 4. Gateway consumerOpts (builder extracted via getOpts() or Partial<ConsumerOpts>).
 * 5. Built-in defaults applied by {@link resolveConsumerSubscribeOpts}.
 */
export function resolveSubscriptionConsumerOpts(
  gateway: GatewayConsumerOptions | undefined,
  perSubscription?: ConsumerSubscribeOpts,
): ConsumerSubscribeOpts {
  if (isConsumerOptsBuilder(perSubscription)) {
    return perSubscription;
  }
  const merged = buildMergedConsumerConfig(gateway, perSubscription);
  return resolveConsumerSubscribeOpts(merged);
}

function buildMergedConsumerConfig(
  gateway: GatewayConsumerOptions | undefined,
  perSubscription: ConsumerSubscribeOpts | undefined,
): Partial<ConsumerOpts> {
  const base = extractBaseConsumerOpts(gateway?.consumerOpts);
  const scalars = gatewayScalarsToConfig(gateway);
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

function gatewayScalarsToConfig(gateway: GatewayConsumerOptions | undefined): Partial<ConsumerConfig> {
  if (!gateway) {
    return {};
  }
  return {
    ...(gateway.durableName && { durable_name: gateway.durableName }),
    ...(gateway.deliverPolicy !== undefined && { deliver_policy: gateway.deliverPolicy }),
    ...(gateway.ackPolicy !== undefined && { ack_policy: gateway.ackPolicy }),
    ...(gateway.maxDeliver !== undefined && { max_deliver: gateway.maxDeliver }),
    ...(gateway.replayPolicy !== undefined && { replay_policy: gateway.replayPolicy }),
  };
}
