# Simplification Plan — Task 1: Explorer Getter Crash Fix

## Overview

The implementation correctly fixes the getter-property crash in both explorers, but it leaves significant duplication and one project-rule violation. This plan proposes safe, internal refactorings that reduce duplication without changing public API or behavior.

## Identified Issues

1. **Rule violation:** `src/events-toolkit.runtime.e2e-spec.ts` is 212 lines, exceeding the 200-line limit for `src/` code files.
2. **Duplication:** `OnEventExplorer` and `OnRequestReplyExplorer` share ~50 lines of identical scanning/validation logic (`HandlerTarget`, `getValidInstances`, wrapper validation, `registerInstanceHandlers`).
3. **Indirection:** `isValidWrapper` is a one-line wrapper around `hasObjectInstance`.
4. **Redundant test pairs:** Each explorer spec has two accessor-related tests that can be merged without losing coverage.

## Proposed Simplifications

### 1. Extract shared explorer scanning utilities

**New file:** `src/consumer/decorators/explorer.utils.ts`

Move the duplicated infrastructure into shared helpers so each explorer only keeps its metadata-specific registration logic.

```typescript
import { DiscoveryService } from '@nestjs/core';

export interface HandlerTarget {
  instance: object;
  prototype: object;
}

export function getValidInstances(discovery: DiscoveryService): object[] {
  const allWrappers = [...discovery.getProviders(), ...discovery.getControllers()];
  return allWrappers.filter(hasObjectInstance).map((w) => w.instance as object);
}

function hasObjectInstance(wrapper: { instance?: unknown }): boolean {
  return wrapper.instance != null && typeof wrapper.instance === 'object';
}

export function scanInstanceHandlers(
  instance: object,
  register: (target: HandlerTarget, methodName: string) => void,
): void {
  const prototype = Object.getPrototypeOf(instance);
  const methodNames = Object.getOwnPropertyNames(prototype);
  for (const methodName of methodNames) {
    if (methodName === 'constructor') continue;
    register({ instance, prototype }, methodName);
  }
}

export function isFunctionDataProperty(descriptor: PropertyDescriptor | undefined): boolean {
  return descriptor != null && typeof descriptor.value === 'function';
}
```

**Update `OnEventExplorer` (after):**

```typescript
import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { EventHandler } from '../consumer.service';
import { ON_EVENT_METADATA, OnEventMetadata } from './on-event.decorator';
import { ON_EVENT_EXPLORER_DEPS_TOKEN, OnEventExplorerDeps } from './on-event-explorer-deps.interface';
import { getValidInstances, isFunctionDataProperty, scanInstanceHandlers } from './explorer.utils';

@Injectable()
export class OnEventExplorer implements OnModuleInit {
  constructor(@Inject(ON_EVENT_EXPLORER_DEPS_TOKEN) private readonly deps: OnEventExplorerDeps) {}

  onModuleInit(): void {
    this.explore();
  }

  private explore(): void {
    const instances = getValidInstances(this.deps.discovery);
    for (const instance of instances) {
      scanInstanceHandlers(instance, (target, methodName) => this.tryRegisterHandler(target, methodName));
    }
  }

  private tryRegisterHandler(target: HandlerTarget, methodName: string): void {
    const descriptor = Object.getOwnPropertyDescriptor(target.prototype, methodName);
    if (!isFunctionDataProperty(descriptor)) return;

    const methodRef = descriptor.value as (...args: unknown[]) => unknown;
    const metadata = this.deps.reflector.get<OnEventMetadata>(ON_EVENT_METADATA, methodRef);
    if (!metadata) return;

    const handler = methodRef.bind(target.instance) as EventHandler;
    const subject = this.buildWildcardSubject(metadata);
    this.deps.consumerService.registerHandler(subject, handler);
  }

  private buildWildcardSubject(metadata: OnEventMetadata): string {
    return `company.*.${metadata.eventType}.v${metadata.version}`;
  }
}
```

Apply the same structure to `OnRequestReplyExplorer`, replacing `ON_EVENT_*` with `ON_REQUEST_REPLY_*` and `consumerService` with `requestReplyConsumerService`.

**Rationale:** Eliminates ~50 lines of duplicated code, makes future scanning changes happen in one place, and keeps each explorer focused on its registration semantics.

### 2. Fix the 200-line e2e spec violation

**New file:** `src/testing/runtime-e2e.fixture.ts`

Move `HandlerWithAccessorsProvider` out of the e2e spec. This is the largest single block in the file and is reusable as a test fixture.

```typescript
import { Injectable } from '@nestjs/common';
import { OnEvent } from '../consumer/decorators/on-event.decorator';
import { OnRequestReply } from '../consumer/decorators/on-request-reply.decorator';

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

**Update `src/events-toolkit.runtime.e2e-spec.ts`:**

- Import `HandlerWithAccessorsProvider` from `./testing/runtime-e2e.fixture`.
- Remove the inline class definition.

**Expected result:** The e2e spec drops from 212 lines to ~176 lines, satisfying the 200-line limit.

**Rationale:** Keeps the spec focused on assertions and removes the rule violation. The fixture is reusable for future runtime tests.

### 3. Remove the `isValidWrapper` indirection

The helper `isValidWrapper` only delegates to `hasObjectInstance`. Remove it and rename `hasObjectInstance` to `isValidWrapper` (or inline the check in `getValidInstances`).

**Before:**

```typescript
private isValidWrapper(wrapper: { instance?: unknown }): boolean {
  return this.hasObjectInstance(wrapper);
}

private hasObjectInstance(wrapper: { instance?: unknown }): boolean {
  return wrapper.instance != null && typeof wrapper.instance === 'object';
}
```

**After (inside `explorer.utils.ts`):**

```typescript
function isValidWrapper(wrapper: { instance?: unknown }): boolean {
  return wrapper.instance != null && typeof wrapper.instance === 'object';
}
```

**Rationale:** Removes an unnecessary method layer and clarifies intent.

### 4. Merge redundant accessor tests

Each explorer spec has two tests for accessors. Merge them into one test that verifies both skipping and the throwing-getter regression.

**Before (`on-event.explorer.spec.ts`):**

```typescript
it('should skip getter/setter accessor properties without throwing', () => {
  const instance = new GetterSetterConsumer();
  (discovery.getProviders as jest.Mock).mockReturnValue([{ instance }]);
  (discovery.getControllers as jest.Mock).mockReturnValue([]);

  expect(() => explorer.onModuleInit()).not.toThrow();
  expect(consumerService.handlerCount).toBe(1);
  expect(consumerService.getHandler('company.*.audit.ledger.snapshot.v1')).toBeDefined();
});

it('should not access prototype getter that throws (HttpAdapterHost.listen$ regression)', () => {
  const instance = new GetterSetterConsumer();
  (discovery.getProviders as jest.Mock).mockReturnValue([{ instance }]);
  (discovery.getControllers as jest.Mock).mockReturnValue([]);

  const prototype = Object.getPrototypeOf(instance);
  const listenGetter = Object.getOwnPropertyDescriptor(prototype, 'listen$')?.get;
  expect(listenGetter).toBeDefined();
  expect(() => listenGetter!()).toThrow(TypeError);
  expect(() => explorer.onModuleInit()).not.toThrow();
});
```

**After:**

```typescript
it('should skip accessor properties, including throwing getters, without invoking them', () => {
  const instance = new GetterSetterConsumer();
  (discovery.getProviders as jest.Mock).mockReturnValue([{ instance }]);
  (discovery.getControllers as jest.Mock).mockReturnValue([]);

  const prototype = Object.getPrototypeOf(instance);
  const listenGetter = Object.getOwnPropertyDescriptor(prototype, 'listen$')?.get;
  expect(listenGetter).toBeDefined();
  expect(() => listenGetter!()).toThrow(TypeError);

  expect(() => explorer.onModuleInit()).not.toThrow();
  expect(consumerService.handlerCount).toBe(1);
  expect(consumerService.getHandler('company.*.audit.ledger.snapshot.v1')).toBeDefined();
});
```

Apply the same merge to `on-request-reply.explorer.spec.ts`.

**Rationale:** Removes ~10 lines per spec file while preserving full regression coverage.

## Constraints Compliance

- No public API changes.
- No behavioral changes; all existing tests should continue to pass.
- Keeps methods under 50 lines and nesting under 2 levels.
- Keeps function parameters at ≤2.
- Preserves single-section boolean conditions.

## Order of Application

1. Create `src/consumer/decorators/explorer.utils.ts` and update both explorers.
2. Create `src/testing/runtime-e2e.fixture.ts` and update the e2e spec.
3. Merge accessor tests in both explorer specs.
4. Run the full test suite to verify no regressions.
