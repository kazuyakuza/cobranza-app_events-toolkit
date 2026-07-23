/**
 * Unit tests for the consumer subscribe-options helpers.
 *
 * Covers:
 * - createDefaultConsumerOpts: ensures the default push-consumer builder
 *   sets a unique deliver_subject and enables manual + explicit ack.
 * - resolveConsumerSubscribeOpts: ensures caller-provided deliver_subject
 *   is preserved, and missing values are filled with safe defaults.
 * - isConsumerOptsBuilder: type-guard behaviour for builders vs plain objects.
 */
import { AckPolicy, ConsumerOpts, consumerOpts, createInbox } from 'nats';
import {
  ConsumerSubscribeOpts,
  createDefaultConsumerOpts,
  isConsumerOptsBuilder,
  resolveConsumerSubscribeOpts,
} from './subscribe-options.interface';

function getDeliverSubject(value: ConsumerSubscribeOpts): string | undefined {
  if (isConsumerOptsBuilder(value)) {
    return value.getOpts().config.deliver_subject;
  }
  return (value as Partial<ConsumerOpts>).config?.deliver_subject;
}

function plainOptsWithoutDefaults(): Partial<ConsumerOpts> {
  return { config: {} };
}

describe('createDefaultConsumerOpts', () => {
  it('sets a unique non-empty deliver_subject on the builder config', () => {
    const builder = createDefaultConsumerOpts();

    expect(builder.getOpts().config.deliver_subject).toBeTruthy();
    expect(builder.getOpts().config.deliver_subject).not.toBe(createInbox());
  });

  it('enables manual ack and explicit ack policy (defaults for push consumers)', () => {
    const opts = createDefaultConsumerOpts().getOpts();

    expect(opts.mack).toBe(true);
    expect(opts.config.ack_policy).toBe(AckPolicy.Explicit);
  });
});

describe('resolveConsumerSubscribeOpts', () => {
  it('returns a builder with deliver_subject when opts is undefined', () => {
    const resolved = resolveConsumerSubscribeOpts(undefined);

    expect(getDeliverSubject(resolved)).toBeTruthy();
  });

  it('returns the same builder instance preserving caller-set deliverTo', () => {
    const callerSubject = createInbox();
    const builder = consumerOpts().deliverTo(callerSubject);

    const resolved = resolveConsumerSubscribeOpts(builder);

    expect(resolved).toBe(builder);
    expect(getDeliverSubject(resolved)).toBe(callerSubject);
  });

  it('preserves caller-supplied deliver_subject without mutating the input config', () => {
    const originalConfig = { deliver_subject: 'kept.inbox', ack_policy: AckPolicy.All };
    const opts: Partial<ConsumerOpts> = { config: originalConfig };

    const resolved = resolveConsumerSubscribeOpts(opts) as Partial<ConsumerOpts>;

    expect(resolved.config.deliver_subject).toBe('kept.inbox');
    expect(resolved.config.ack_policy).toBe(AckPolicy.All);
    expect(opts.config).toBe(originalConfig);
  });

  it('defaults deliver_subject and ack_policy when opts is a plain object without defaults', () => {
    const resolved = resolveConsumerSubscribeOpts(plainOptsWithoutDefaults()) as Partial<ConsumerOpts>;

    expect(resolved.config.deliver_subject).toBeTruthy();
    expect(resolved.config.deliver_subject).not.toBe(createInbox());
    expect(resolved.config.ack_policy).toBe(AckPolicy.Explicit);
  });
});

describe('resolveConsumerSubscribeOpts — gateway-undefined equivalence', () => {
  it('returns defaults matching merger delegation path', () => {
    const resolved = resolveConsumerSubscribeOpts(undefined);
    if (isConsumerOptsBuilder(resolved)) {
      const builder = resolved as unknown as { getOpts: () => import('nats').ConsumerOpts };
      expect(builder.getOpts().config.ack_policy).toBe(AckPolicy.Explicit);
    } else {
      const config = (resolved as Partial<import('nats').ConsumerOpts>).config;
      expect(config?.ack_policy).toBe(AckPolicy.Explicit);
    }
  });
});

describe('isConsumerOptsBuilder', () => {
  it('returns true for consumerOpts() and createDefaultConsumerOpts()', () => {
    expect(isConsumerOptsBuilder(consumerOpts())).toBe(true);
    expect(isConsumerOptsBuilder(createDefaultConsumerOpts())).toBe(true);
  });

  it('returns false for plain ConsumerOpts objects, undefined, and null', () => {
    const plain: Partial<ConsumerOpts> = { config: {} };
    expect(isConsumerOptsBuilder(plain)).toBe(false);
    expect(isConsumerOptsBuilder(undefined)).toBe(false);
    // @ts-expect-error — guard against null being passed at runtime by external callers
    expect(isConsumerOptsBuilder(null)).toBe(false);
  });
});
