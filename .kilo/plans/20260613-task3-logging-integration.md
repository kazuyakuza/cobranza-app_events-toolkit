# Task 3: Logging Integration — Implementation Plan

**Date**: 2026-06-14
**Branch**: `feat/outbox-logging-polish-finalization`
**Scope**: Update Winston format to include timestamps; verify all logging methods are complete; update spec.

---

## Pre-Analysis

### Current State
- `src/logging/event-logger.service.ts` (175 lines): All 8 required logging methods exist and are complete:
  - `logEventEmitted` (info), `logEventConsumed` (info), `logEventError` (error), `logEventDlq` (warn)
  - `logOutboxSaved` (info), `logOutboxProcessed` (info), `logOutboxFailed` (warn), `logOutboxDlq` (warn)
- Winston format uses `winston.format.json()` — **no timestamps**.
- `src/logging/event-logger.service.spec.ts` exists but lacks outbox method tests and has a mock that will break with `combine`/`timestamp`.

### What Must Change
1. Replace `winston.format.json()` → `winston.format.combine(winston.format.timestamp(), winston.format.json())`.
2. Update jest mock to include `combine` and `timestamp`.
3. Add test cases for the 4 outbox logging methods.

### Code Rules Compliance (verified)
- Max 200 lines/file: 175 lines currently → after change still ~175. ✓
- Max 50 lines/method: All methods are 3–5 lines. ✓
- Max 2 depth: No nesting. ✓
- Max 2 params: All methods have 1 param. ✓
- Single-section booleans: N/A (no conditionals). ✓
- Prefer private members: `createLogger` is private, public API is minimal. ✓

---

## Step 1: Update Winston Format in `event-logger.service.ts`

**File**: `src/logging/event-logger.service.ts`
**Line**: ~152 (inside `createLogger` method)

**Change**:
```typescript
// Before (line ~152):
format: winston.format.json(),

// After:
format: winston.format.combine(
  winston.format.timestamp(),
  winston.format.json(),
),
```

This adds an ISO 8601 `timestamp` field to every JSON log entry automatically.

---

## Step 2: Update Spec Mock

**File**: `src/logging/event-logger.service.spec.ts`

**2a. Update jest.mock to include `combine` and `timestamp`:**
```typescript
// Before:
format: { json: jest.fn(() => 'mocked-json-format') },

// After:
format: {
  json: jest.fn(() => 'mocked-json-format'),
  timestamp: jest.fn(() => 'mocked-timestamp-format'),
  combine: jest.fn((...formats: unknown[]) => formats),
},
```

**2b. Add test data** (after `errorContext`):
```typescript
const outboxContext = {
  eventId: 'evt_test-456',
  eventType: 'payment.proof.uploaded',
  subject: 'company.abc.payment.proof.uploaded.v1',
  attempt: 0,
  correlationId: 'corr-456',
  traceId: 'trace-789',
};

const outboxErrorContext = {
  ...outboxContext,
  error: 'NATS connection lost',
  stack: 'Error: NATS connection lost\n    at ...',
};
```

**2c. Add outbox method tests** (after `logEventDlq` describe block):
```typescript
describe('logOutboxSaved', () => {
  it('logs at info level with outbox context', () => {
    const service = new EventLoggerService();
    service.logOutboxSaved(outboxContext);
    expect(mockInfo).toHaveBeenCalledWith('Outbox event saved', outboxContext);
  });
});

describe('logOutboxProcessed', () => {
  it('logs at info level with outbox context', () => {
    const service = new EventLoggerService();
    service.logOutboxProcessed(outboxContext);
    expect(mockInfo).toHaveBeenCalledWith('Outbox event processed', outboxContext);
  });
});

describe('logOutboxFailed', () => {
  it('logs at warn level with outbox error context', () => {
    const service = new EventLoggerService();
    service.logOutboxFailed(outboxErrorContext);
    expect(mockWarn).toHaveBeenCalledWith('Outbox event processing failed', outboxErrorContext);
  });
});

describe('logOutboxDlq', () => {
  it('logs at warn level with outbox error context', () => {
    const service = new EventLoggerService();
    service.logOutboxDlq(outboxErrorContext);
    expect(mockWarn).toHaveBeenCalledWith('Outbox event routed to DLQ', outboxErrorContext);
  });
});
```

---

## Step 3: Build & Test

```powershell
npm run build
npm test
```

**Expected**: Build succeeds, all tests pass (existing + new outbox tests).

---

## Step 4: Git Commit

```powershell
git add src/logging/event-logger.service.ts src/logging/event-logger.service.spec.ts
git commit -m "feat(logging): add Winston timestamp format and outbox method tests"
```

---

## Verification Checklist

- [ ] `winston.format.timestamp()` is included in format pipeline
- [ ] `winston.format.combine()` wraps timestamp + json
- [ ] All 8 logging methods present and unchanged
- [ ] Spec mock includes `combine` and `timestamp`
- [ ] Outbox method tests (4) added and passing
- [ ] `npm run build` succeeds
- [ ] `npm test` passes
- [ ] No lint errors
- [ ] No commented-out code
