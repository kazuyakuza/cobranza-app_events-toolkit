import { AckPolicy, ConsumerOpts, consumerOpts, createInbox } from 'nats';
import {
  ConsumerSubscribeOpts,
  createDefaultConsumerOpts,
  isConsumerOptsBuilder,
  resolveConsumerSubscribeOpts,
} from './subscribe-options.interface';

function deliverSubjectOf(value: ConsumerSubscribeOpts): string | undefined {
  if (isConsumerOptsBuilder(value)) {
    return value.getOpts().config.deliver_subject;
  }
  return (value as Partial<ConsumerOpts>).config?.deliver_subject;
}

function plainOptsWithoutDefaults(): Partial<ConsumerOpts> {
  return { mack: false, stream: 'test-stream', config: {} };
}

describe('createDefaultConsumerOpts', () => {
  it('returns a ConsumerOptsBuilder detectable by isConsumerOptsBuilder', () => {
    expect(isConsumerOptsBuilder(createDefaultConsumerOpts())).toBe(true);
  });

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
  describe('when opts is undefined', () => {
    it('returns a builder whose deliver_subject is set', () => {
      const resolved = resolveConsumerSubscribeOpts(undefined);

      expect(deliverSubjectOf(resolved)).toBeTruthy();
    });
  });

  describe('when opts is a ConsumerOptsBuilder', () => {
    it('returns the same builder instance preserving caller-set deliverTo', () => {
      const callerSubject = createInbox();
      const builder = consumerOpts().deliverTo(callerSubject);

      const resolved = resolveConsumerSubscribeOpts(builder);

      expect(resolved).toBe(builder);
      expect(deliverSubjectOf(resolved)).toBe(callerSubject);
    });
  });

  describe('when opts is a plain object with deliver_subject', () => {
    it('preserves the caller-supplied deliver_subject without mutating the input config', () => {
      const originalConfig = { deliver_subject: 'kept.inbox', ack_policy: AckPolicy.All };
      const opts: Partial<ConsumerOpts> = { config: originalConfig };

      const resolved = resolveConsumerSubscribeOpts(opts) as Partial<ConsumerOpts>;

      expect(resolved.config.deliver_subject).toBe('kept.inbox');
      expect(resolved.config.ack_policy).toBe(AckPolicy.All);
      expect(opts.config).toBe(originalConfig);
    });
  });

  describe('when opts is a plain object without deliver_subject', () => {
    it('defaults deliver_subject to a unique non-empty inbox', () => {
      const resolved = resolveConsumerSubscribeOpts(plainOptsWithoutDefaults()) as Partial<ConsumerOpts>;

      expect(resolved.config.deliver_subject).toBeTruthy();
      expect(resolved.config.deliver_subject).not.toBe(createInbox());
    });

    it('defaults ack_policy to AckPolicy.Explicit when omitted', () => {
      const resolved = resolveConsumerSubscribeOpts(plainOptsWithoutDefaults()) as Partial<ConsumerOpts>;

      expect(resolved.config.ack_policy).toBe(AckPolicy.Explicit);
    });
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
