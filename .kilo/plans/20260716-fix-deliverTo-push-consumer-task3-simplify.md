# Simplification Plan — `src/consumer/subscribe-options.interface.spec.ts`

## Findings

The spec file is already readable and well-structured, but several small simplifications can reduce repetition and improve conciseness while preserving clarity.

## Simplification Opportunities

### 1. Flatten nested `describe` blocks in `resolveConsumerSubscribeOpts`

The current structure uses four nested `describe` blocks inside `resolveConsumerSubscribeOpts`. Each `it` block is at the third indentation level, increasing file depth and line count. The scenarios can be expressed as direct `it` blocks with descriptive names.

**Current:**

```typescript
describe('resolveConsumerSubscribeOpts', () => {
  describe('when opts is undefined', () => {
    it('returns a builder whose deliver_subject is set', () => {
      // ...
    });
  });

  describe('when opts is a ConsumerOptsBuilder', () => {
    it('returns the same builder instance preserving caller-set deliverTo', () => {
      // ...
    });
  });

  // ...
});
```

**Simplified:**

```typescript
describe('resolveConsumerSubscribeOpts', () => {
  it('returns a builder with deliver_subject when opts is undefined', () => {
    // ...
  });

  it('returns the same builder instance preserving caller-set deliverTo', () => {
    // ...
  });

  // ...
});
```

### 2. Remove redundant `isConsumerOptsBuilder` assertion

`createDefaultConsumerOpts()` is already tested as a builder in the `isConsumerOptsBuilder` suite. The first test in `createDefaultConsumerOpts` only duplicates that coverage.

**Current:**

```typescript
describe('createDefaultConsumerOpts', () => {
  it('returns a ConsumerOptsBuilder detectable by isConsumerOptsBuilder', () => {
    expect(isConsumerOptsBuilder(createDefaultConsumerOpts())).toBe(true);
  });

  it('sets a unique non-empty deliver_subject on the builder config', () => {
    // ...
  });

  it('enables manual ack and explicit ack policy (defaults for push consumers)', () => {
    // ...
  });
});
```

**Simplified:**

```typescript
describe('createDefaultConsumerOpts', () => {
  it('sets a unique non-empty deliver_subject on the builder config', () => {
    // ...
  });

  it('enables manual ack and explicit ack policy (defaults for push consumers)', () => {
    // ...
  });
});
```

### 3. Merge related plain-object tests

The two tests under `when opts is a plain object without deliver_subject` both invoke `resolveConsumerSubscribeOpts(plainOptsWithoutDefaults())` and assert on the same resolved config. They can be merged into a single test.

**Current:**

```typescript
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
```

**Simplified:**

```typescript
it('defaults deliver_subject and ack_policy when opts is a plain object without defaults', () => {
  const resolved = resolveConsumerSubscribeOpts(plainOptsWithoutDefaults()) as Partial<ConsumerOpts>;

  expect(resolved.config.deliver_subject).toBeTruthy();
  expect(resolved.config.deliver_subject).not.toBe(createInbox());
  expect(resolved.config.ack_policy).toBe(AckPolicy.Explicit);
});
```

### 4. Simplify `plainOptsWithoutDefaults()` helper

The helper returns `{ mack: false, stream: 'test-stream', config: {} }`. The `mack` and `stream` properties are not asserted anywhere in the tests that use it. Removing them makes the helper's intent clearer.

**Current:**

```typescript
function plainOptsWithoutDefaults(): Partial<ConsumerOpts> {
  return { mack: false, stream: 'test-stream', config: {} };
}
```

**Simplified:**

```typescript
function plainOptsWithoutDefaults(): Partial<ConsumerOpts> {
  return { config: {} };
}
```

### 5. Rename `deliverSubjectOf` for clarity (optional)

`deliverSubjectOf` is a concise helper name, but `getDeliverSubject` more clearly signals a reader/accessor. This is a minor readability improvement.

**Current:**

```typescript
function deliverSubjectOf(value: ConsumerSubscribeOpts): string | undefined {
```

**Simplified:**

```typescript
function getDeliverSubject(value: ConsumerSubscribeOpts): string | undefined {
```

## Proposed Refactored Spec

```typescript
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
```

## Impact

- **Lines**: Reduced from ~103 lines to ~84 lines.
- **Nesting depth**: Reduced from 3 levels to 2 levels within the `resolveConsumerSubscribeOpts` suite.
- **Repetition**: Eliminates one duplicated assertion and one repeated function call.
- **Clarity**: Helper intent is more explicit; test names carry the scenario context.
- **Coverage**: No behavioral coverage is lost; all original assertions remain.

## Out of Scope

- No changes to `subscribe-options.interface.ts` production code.
- No test logic additions or removals beyond the simplifications above.
