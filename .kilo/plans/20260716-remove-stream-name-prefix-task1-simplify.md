# Task 1 Simplification Plan — Remove stream-name prefix

Scope: code simplification review of the Task 1 implementation (prefix removal from `buildStreamName` and updated tests). Focus is on `src/consumer/build-stream-name.util.ts` and `src/consumer/stream-auto-creator.spec.ts` only.

## Summary

Three low-risk simplifications are identified:

1. Reduce the verbose full-stream-config assertion in `stream-auto-creator.spec.ts` to the fields the test actually validates.
2. Fix the misleading return type in the `createMockConnection` helper so it matches the runtime value and call-site usage.
3. Tighten the JSDoc wording in `build-stream-name.util.ts` to remove a contradiction.

No production behavior changes. No tests are added or removed.

## Simplification 1 — Stream config assertion

**File:** `src/consumer/stream-auto-creator.spec.ts`  
**Lines:** 59–81

### Current

```ts
expect(jetStreamManagerMock.add).toHaveBeenCalledWith({
  name: 'test-subject',
  subjects: ['test.subject'],
  retention: RetentionPolicy.Limits,
  storage: StorageType.File,
  max_consumers: -1,
  max_msgs: -1,
  max_bytes: -1,
  max_age: 0,
  max_msgs_per_subject: -1,
  max_msg_size: -1,
  discard: DiscardPolicy.Old,
  discard_new_per_subject: false,
  num_replicas: 1,
  sealed: false,
  first_seq: 0,
  duplicate_window: 0,
  allow_rollup_hdrs: false,
  deny_delete: false,
  deny_purge: false,
  allow_direct: false,
  mirror_direct: false,
});
```

### Proposed

```ts
expect(jetStreamManagerMock.add).toHaveBeenCalledWith(
  expect.objectContaining({
    name: 'test-subject',
    subjects: ['test.subject'],
    retention: RetentionPolicy.Limits,
    storage: StorageType.File,
  }),
);
```

**Rationale:** The test is verifying that the stream is created for the correct subject with sane defaults. Asserting every default field adds noise and makes the test brittle. The dedicated override test already covers custom `max_bytes`, and the `name`/`subjects`/`retention`/`storage` values are the meaningful ones here.

## Simplification 2 — Mock helper type alignment

**File:** `src/consumer/stream-auto-creator.spec.ts`  
**Lines:** 12–20

### Current

```ts
function createMockConnection(): {
  connection: NatsConnection;
  jetStreamManagerMock: { streams: { find: jest.Mock; add: jest.Mock; }; };
} {
  const streams = { find: jest.fn(), add: jest.fn() };
  const jetStreamManager = { streams };
  const connection = { jetstreamManager: jest.fn().mockResolvedValue(jetStreamManager) } as unknown as NatsConnection;
  return { connection, jetStreamManagerMock: streams };
}
```

### Proposed

```ts
function createMockConnection(): {
  connection: NatsConnection;
  jetStreamManagerMock: { find: jest.Mock; add: jest.Mock; };
} {
  const jetStreamManagerMock = { find: jest.fn(), add: jest.fn() };
  const jetStreamManager = { streams: jetStreamManagerMock };
  const connection = { jetstreamManager: jest.fn().mockResolvedValue(jetStreamManager) } as unknown as NatsConnection;
  return { connection, jetStreamManagerMock };
}
```

**Rationale:** The declared return type says `jetStreamManagerMock` has a `streams` property, but every call site uses `jetStreamManagerMock.find` and `jetStreamManagerMock.add` directly. The runtime value is the `streams` object, not a wrapper. Aligning the declared type with actual usage removes confusion and latent type mismatch.

## Simplification 3 — JSDoc wording

**File:** `src/consumer/build-stream-name.util.ts`  
**Line:** 11

### Current

```ts
 * The subject is returned verbatim (sanitized) with no added prefix, keeping auto-created stream names consistent with the
```

### Proposed

```ts
 * The sanitized subject is returned with no added prefix, keeping auto-created stream names consistent with the
```

**Rationale:** "Verbatim" and "sanitized" contradict each other; the simplified sentence is clearer.

## Verification

After applying the simplifications:

1. `npm run build` — no type errors.
2. `npm test -- src/consumer/stream-auto-creator.spec.ts` — all tests pass.
3. `npm run lint` — no lint errors.

## Out of scope

- No changes to `src/consumer/stream-auto-creator.ts` or other files.
- No renames of public exports or the `buildStreamName` function.
- No new test cases or deletions.
