/**
 * Unit tests for consumer-opts-merger — merge precedence matrix.
 *
 * Covers the full precedence chain:
 * 1. Per-subscription ConsumerOptsBuilder → full override
 * 2. Per-subscription Partial<ConsumerOpts> → overrides gateway
 * 3. Gateway scalars → override matching consumerOpts config fields
 * 4. Gateway consumerOpts (builder or partial)
 * 5. Built-in defaults (ack_policy Explicit, unique deliver_subject)
 */
import { AckPolicy, consumerOpts, ConsumerOpts, DeliverPolicy, ReplayPolicy } from 'nats';
import { resolveSubscriptionConsumerOpts } from './consumer-opts-merger';
import { ModuleConsumerOptions } from './module-consumer-options.interface';
import { isConsumerOptsBuilder } from './subscribe-options.interface';

type ConsumerOptsBuilderWithGetOpts = { getOpts(): ConsumerOpts };

function getConfig(resolved: ReturnType<typeof resolveSubscriptionConsumerOpts>): Partial<ConsumerOpts> {
  if (isConsumerOptsBuilder(resolved)) {
    return (resolved as unknown as ConsumerOptsBuilderWithGetOpts).getOpts();
  }
  return resolved;
}

describe('resolveSubscriptionConsumerOpts', () => {
  describe('no gateway, no per-subscription → default builder', () => {
    const resolved = resolveSubscriptionConsumerOpts(undefined, undefined);
    const config = getConfig(resolved);

    it('returns a builder with mack = true', () => {
      expect(config.mack).toBe(true);
    });

    it('defaults ack_policy to Explicit', () => {
      expect(config.config?.ack_policy).toBe(AckPolicy.Explicit);
    });

    it('sets a unique deliver_subject', () => {
      expect(config.config?.deliver_subject).toBeTruthy();
    });
  });

  describe('gateway durableName only', () => {
    const gateway: ModuleConsumerOptions = { durableName: 'd1' };
    const resolved = resolveSubscriptionConsumerOpts(gateway, undefined);
    const config = getConfig(resolved);

    it('sets durable_name from gateway scalar', () => {
      expect(config.config?.durable_name).toBe('d1');
    });

    it('still defaults ack_policy to Explicit', () => {
      expect(config.config?.ack_policy).toBe(AckPolicy.Explicit);
    });

    it('does not set deliver_policy so NATS uses the durable stored state', () => {
      expect(config.config?.deliver_policy).toBeUndefined();
    });
  });

  describe('gateway with durableName and deliverPolicy', () => {
    const gateway: ModuleConsumerOptions = { durableName: 'd1', deliverPolicy: DeliverPolicy.New };
    const resolved = resolveSubscriptionConsumerOpts(gateway, undefined);
    const config = getConfig(resolved);

    it('sets durable_name', () => {
      expect(config.config?.durable_name).toBe('d1');
    });

    it('sets deliver_policy to New', () => {
      expect(config.config?.deliver_policy).toBe(DeliverPolicy.New);
    });
  });

  describe('per-subscription overrides gateway durable name', () => {
    const gateway: ModuleConsumerOptions = { durableName: 'd1' };
    const resolved = resolveSubscriptionConsumerOpts(gateway, { config: { durable_name: 'per' } });
    const config = getConfig(resolved);

    it('uses per-subscription durable_name', () => {
      expect(config.config?.durable_name).toBe('per');
    });
  });

  describe('per-subscription ConsumerOptsBuilder fully overrides gateway', () => {
    it('returns the same builder reference; gateway is ignored', () => {
      const gateway: ModuleConsumerOptions = { durableName: 'd1' };
      const builder = consumerOpts().durable('builder-only').deliverTo('x').ackExplicit();
      const resolved = resolveSubscriptionConsumerOpts(gateway, builder);
      expect(resolved).toBe(builder);
    });
  });

  describe('per-subscription ack_policy overrides gateway', () => {
    const gateway: ModuleConsumerOptions = { ackPolicy: AckPolicy.None };
    const resolved = resolveSubscriptionConsumerOpts(gateway, { config: { ack_policy: AckPolicy.All } });
    const config = getConfig(resolved);

    it('uses per-subscription ack_policy', () => {
      expect(config.config?.ack_policy).toBe(AckPolicy.All);
    });
  });

  describe('gateway consumerOpts (partial) with scalar override', () => {
    const gateway: ModuleConsumerOptions = {
      consumerOpts: { config: { durable_name: 'base', max_deliver: 5 } },
      durableName: 'scalar',
    };
    const resolved = resolveSubscriptionConsumerOpts(gateway, undefined);
    const config = getConfig(resolved);

    it('scalar overrides durable_name from consumerOpts base', () => {
      expect(config.config?.durable_name).toBe('scalar');
    });

    it('preserves max_deliver from consumerOpts base', () => {
      expect(config.config?.max_deliver).toBe(5);
    });
  });

  describe('gateway with maxDeliver and replayPolicy scalars only', () => {
    const gateway: ModuleConsumerOptions = { maxDeliver: 3, replayPolicy: ReplayPolicy.Original };
    const resolved = resolveSubscriptionConsumerOpts(gateway, undefined);
    const config = getConfig(resolved);

    it('sets max_deliver from gateway scalar', () => {
      expect(config.config?.max_deliver).toBe(3);
    });

    it('sets replay_policy from gateway scalar', () => {
      expect(config.config?.replay_policy).toBe(ReplayPolicy.Original);
    });
  });

  describe('gateway builder consumerOpts', () => {
    it('extracts durable_name and ack_policy from gateway builder', () => {
      const builder = consumerOpts().durable('g').ackExplicit();
      const gateway: ModuleConsumerOptions = { consumerOpts: builder };
      const resolved = resolveSubscriptionConsumerOpts(gateway, undefined);
      const config = getConfig(resolved);
      expect(config.config?.durable_name).toBe('g');
      expect(config.config?.ack_policy).toBe(AckPolicy.Explicit);
    });
  });

  describe('scalar ackPolicy overrides gateway builder', () => {
    it('uses scalar ack_policy over builder ack_policy', () => {
      const gateway: ModuleConsumerOptions = {
        consumerOpts: consumerOpts().ackAll(),
        ackPolicy: AckPolicy.Explicit,
      };
      const resolved = resolveSubscriptionConsumerOpts(gateway, undefined);
      const config = getConfig(resolved);
      expect(config.config?.ack_policy).toBe(AckPolicy.Explicit);
    });
  });
});
