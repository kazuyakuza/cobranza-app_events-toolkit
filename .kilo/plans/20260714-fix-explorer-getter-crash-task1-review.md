# Code Review Findings — Task 1

Reviewer: code-reviewer  
Date: 2026-07-14  
Branch: `fix/explorer-getter-crash`  
Implementation commit: `9068478`

## Summary

The implementation matches the per-task plan for the explorer getter crash fix. `npm run build` and `npm test` both pass (64 suites, 562 tests).

One rule-compliance deviation was found: `src/events-toolkit.runtime.e2e-spec.ts` exceeds the 200-line per-file limit.

## Checklist Status

| Item | Status |
|------|--------|
| Both explorers use `Object.getOwnPropertyDescriptor` correctly | Pass |
| Guard `!descriptor` / `typeof descriptor.value !== 'function'` before metadata reflection | Pass |
| No stale `// Accessor properties...` comments | Pass |
| `methodRef.bind(target.instance)` used instead of re-access | Pass |
| Test fixtures extracted for both unit specs | Pass |
| Throwing `listen$` getter in both fixture `GetterSetterConsumer` classes | Pass |
| Regression tests in both spec files asserting getter throws but `onModuleInit()` does not | Pass |
| E2E test no longer uses `limitDiscoveryToHandlerProvider` workaround | Pass |
| E2E provider has throwing `listen$` getter | Pass |
| CHANGELOG `[0.10.7]` accurate and placed above `[0.10.5]` | Pass |
| Max 50 lines/method, max 2 depth, max 2 params, single-section booleans, no commented-out code, prefer private members | Pass |
| `npm run build` and `npm test` pass | Pass |
| **Max 200 lines/file** | **Fail** |

## Issue Found

### 1. E2E spec exceeds the max-lines-per-file limit

- **File:** `src/events-toolkit.runtime.e2e-spec.ts`
- **Current total lines:** 212
- **Limit:** 200 lines (`.kilo/rules/max-lines-per-file.md`)
- **Excess source:** the inline `HandlerWithAccessorsProvider` class at lines 40–83 (including its doc block and blank lines).

## Fix Plan

### Step 1 — Extract the inline test provider to a fixture file

Create `src/events-toolkit.runtime.e2e-fixtures.ts` with the following content:

```typescript
import { Injectable } from '@nestjs/common';
import { OnEvent } from './consumer/decorators/on-event.decorator';
import { OnRequestReply } from './consumer/decorators/on-request-reply.decorator';

/**
 * Test provider that combines decorated handlers with getter/setter accessors.
 *
 * The accessors trigger `Object.getOwnPropertyNames(prototype)` to return
 * non-function members, which is exactly the shape that produced the
 * `Reflect.getMetadata(undefined)` crash before the `typeof methodRef` guard.
 */
@Injectable()
export class HandlerWithAccessorsProvider {
  handlerInvoked = false;

  @OnEvent('payment.proof.uploaded', {
    version: '1',
    description: 'Handles payment proof uploads (e2e runtime guard)',
    payloadExample: { proofId: 'proof-123' },
  })
  async handleProofUploaded(): Promise<void> {
    this.handlerInvoked = true;
  }

  @OnRequestReply('payment.proof.uploaded', {
    description: 'Handles payment proof upload responses (e2e runtime guard)',
    payloadExample: { proofId: 'proof-123' },
  })
  async handleProofUploadedResponse(): Promise<void> {
    this.handlerInvoked = true;
  }

  private _cachedValue = '';

  get cachedValue(): string {
    return this._cachedValue;
  }

  set cachedValue(value: string) {
    this._cachedValue = value;
  }

  get listen$(): never {
    throw new TypeError("Cannot read properties of undefined (reading 'asObservable')");
  }

  plainMethod(): void {}
}
```

### Step 2 — Update the E2E spec

In `src/events-toolkit.runtime.e2e-spec.ts`:

1. Remove lines 40–83 (the `HandlerWithAccessorsProvider` class and its preceding doc block).
2. Remove these now-unused imports:
   - Line 26: `import { Injectable } from '@nestjs/common';`
   - Line 34: `import { OnEvent } from './consumer/decorators/on-event.decorator';`
   - Line 35: `import { OnRequestReply } from './consumer/decorators/on-request-reply.decorator';`
3. Add the fixture import near the top import block:

```typescript
import { HandlerWithAccessorsProvider } from './events-toolkit.runtime.e2e-fixtures';
```

4. Keep `providers: [HandlerWithAccessorsProvider]` unchanged.

Expected result: the E2E spec shrinks from **212 lines to approximately 169 lines**, satisfying the 200-line limit.

### Step 3 — Exclude e2e fixtures from the production build

Update `tsconfig.build.json` so the new fixture file is not emitted to `dist`:

```json
"exclude": ["node_modules", "dist", "**/*.spec.ts", "**/*.test.ts", "**/*.e2e-spec.ts", "**/*.e2e-fixtures.ts", "**/__mocks__/**"]
```

### Step 4 — Verify

Run the full verification commands:

```bash
npm run build
npm test
```

Both must pass with no new warnings or failures.
