import type { ConsumerConfig, ConsumerOpts } from 'nats';
import {
  ConsumerSubscribeOpts,
  createDefaultConsumerOpts,
  isConsumerOptsBuilder,
  resolveConsumerSubscribeOpts,
} from './subscribe-options.interface';
import { GatewayConsumerOptions } from './gateway-consumer-options.interface';

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
  if (!hasGatewayOrPerSubscription(gateway, perSubscription)) {
    return createDefaultConsumerOpts();
  }
  const merged = buildMergedConsumerConfig(gateway, perSubscription);
  return resolveConsumerSubscribeOpts(merged);
}

function hasGatewayOrPerSubscription(
  gateway: GatewayConsumerOptions | undefined,
  perSubscription: ConsumerSubscribeOpts | undefined,
): boolean {
  if (perSubscription !== undefined) {
    return true;
  }
  if (!gateway) {
    return false;
  }
  const hasScalar =
    gateway.durableName !== undefined ||
    gateway.deliverPolicy !== undefined ||
    gateway.ackPolicy !== undefined ||
    gateway.maxDeliver !== undefined ||
    gateway.replayPolicy !== undefined;
  return hasScalar || gateway.consumerOpts !== undefined;
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
    return (opts as unknown as { getOpts: () => ConsumerOpts }).getOpts();
  }
  return opts;
}

function gatewayScalarsToConfig(gateway: GatewayConsumerOptions | undefined): Partial<ConsumerConfig> {
  const config: Partial<ConsumerConfig> = {};
  if (gateway?.durableName) {
    config.durable_name = gateway.durableName;
  }
  if (gateway?.deliverPolicy !== undefined) {
    config.deliver_policy = gateway.deliverPolicy;
  }
  if (gateway?.ackPolicy !== undefined) {
    config.ack_policy = gateway.ackPolicy;
  }
  if (gateway?.maxDeliver !== undefined) {
    config.max_deliver = gateway.maxDeliver;
  }
  if (gateway?.replayPolicy !== undefined) {
    config.replay_policy = gateway.replayPolicy;
  }
  return config;
}
