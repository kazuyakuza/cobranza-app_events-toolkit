# Plan: Task 8 — Testing Support for Discovery

## Summary

Extend `src/testing/` module with mock services, assertion helpers, and test module options for Discovery features. This enables writing integration/unit tests that can simulate the discovery lifecycle (registration, heartbeat, shutdown) and assert on platform events.

## Files Overview

### New Files (7 source + 5 spec)

| # | File | Purpose |
|---|------|---------|
| 1 | `src/testing/events-toolkit-test-options.interface.ts` | Options type for `EventsToolkitTestModule.forRoot()` |
| 2 | `src/testing/mock-manifest.service.ts` | Mock for `ManifestService` |
| 3 | `src/testing/mock-discovery-event-publisher.service.ts` | Mock for `DiscoveryEventPublisher` |
| 4 | `src/testing/mock-discovery.service.ts` | Mock for `DiscoveryService` |
| 5 | `src/testing/discovery-assertion.helpers.ts` | Assertion helpers for platform events |
| 6 | `src/testing/mock-manifest.service.spec.ts` | Tests for MockManifestService |
| 7 | `src/testing/mock-discovery-event-publisher.service.spec.ts` | Tests for MockDiscoveryEventPublisher |
| 8 | `src/testing/mock-discovery.service.spec.ts` | Tests for MockDiscoveryService |
| 9 | `src/testing/discovery-assertion.helpers.spec.ts` | Tests for discovery assertion helpers |

### Modified Files (4)

| # | File | Change |
|---|------|--------|
| 10 | `src/testing/mock-producer.service.ts` | Add `getPublishedEventsBySubject()` method |
| 11 | `src/testing/mock-producer.service.spec.ts` | Add test for new method |
| 12 | `src/testing/events-toolkit-test.module.ts` | Accept `options?` param, conditionally provide discovery mocks |
| 13 | `src/testing/events-toolkit-test.module.spec.ts` | Add tests for discovery options |
| 14 | `src/testing/index.ts` | Export new types and helpers |

---

## Step-by-Step Implementation

### Step 1: Create `src/testing/events-toolkit-test-options.interface.ts`

```ts
import { ServiceInfo } from '../discovery/service-info.interface';

/** Configuration for discovery mocks in the test module. */
export interface DiscoveryTestOptions {
  /** Whether to register discovery mock services. Default: true. */
  enabled?: boolean;
  /** Service identity used by MockManifestService when generating manifests. */
  serviceInfo?: ServiceInfo;
}

/** Options for EventsToolkitTestModule.forRoot(). */
export interface EventsToolkitTestModuleOptions {
  /** Discovery mock configuration. Omit for defaults (enabled: true). */
  discovery?: DiscoveryTestOptions;
}
```

**Constraints check**: ~15 lines ✓, max 2 params ✓, 2 indent levels ✓

### Step 2: Add `getPublishedEventsBySubject()` to `src/testing/mock-producer.service.ts`

Add method after `getPublishedSubjects()` (line 41):

```ts
/** Returns all published events matching the given NATS subject. */
getPublishedEventsBySubject(subject: string): ReadonlyArray<PublishedEvent> {
  return this.published.filter((e) => e.subject === subject);
}
```

This method filters by `subject` field directly, matching platform event subjects like `platform.service.register.v1`.

### Step 3: Add test for `getPublishedEventsBySubject()` in `src/testing/mock-producer.service.spec.ts`

Add a new `describe` block:

```ts
describe('getPublishedEventsBySubject', () => {
  it('returns events matching the subject', async () => {
    await producer.publish('platform.service.register.v1', createEnvelope('a'));
    await producer.publish('platform.service.heartbeat.v1', createEnvelope('b'));
    await producer.publish('platform.service.register.v1', createEnvelope('c'));

    const result = producer.getPublishedEventsBySubject('platform.service.register.v1');
    expect(result.length).toBe(2);
  });

  it('returns empty array when no events match', () => {
    const result = producer.getPublishedEventsBySubject('nonexistent.subject');
    expect(result).toEqual([]);
  });
});
```

> Note: The existing spec file likely has a `createEnvelope` helper or similar. Verify structure before writing.

### Step 4: Create `src/testing/mock-manifest.service.ts`

```ts
import { Injectable } from '@nestjs/common';
import { ManifestService } from '../discovery/manifest.service';
import { ServiceManifestDto } from '../discovery/dto/service-manifest.dto';
import { ServiceInfo } from '../discovery/service-info.interface';
import { generateInstanceId } from '../discovery/instance-id.utils';

/**
 * In-memory mock for ManifestService.
 *
 * Returns a configurable manifest for tests. When no default manifest is set,
 * generates a minimal manifest from the provided ServiceInfo.
 */
@Injectable()
export class MockManifestService {
  private defaultManifest: ServiceManifestDto | null = null;

  /**
   * Generates a service manifest.
   * Returns the configured default manifest if set, otherwise builds one from serviceInfo.
   */
  generateManifest(serviceInfo: ServiceInfo): ServiceManifestDto {
    if (this.defaultManifest) {
      return { ...this.defaultManifest };
    }
    return this.buildDefaultManifest(serviceInfo);
  }

  /** Sets a pre-configured manifest to return on every generateManifest() call. */
  setDefaultManifest(manifest: ServiceManifestDto): void {
    this.defaultManifest = manifest;
  }

  /** Clears the configured default manifest. */
  clearDefaultManifest(): void {
    this.defaultManifest = null;
  }

  /** Resets all state. */
  clear(): void {
    this.defaultManifest = null;
  }

  private buildDefaultManifest(serviceInfo: ServiceInfo): ServiceManifestDto {
    return {
      name: serviceInfo.name,
      version: serviceInfo.version,
      description: serviceInfo.description ?? '',
      instanceId: serviceInfo.instanceId ?? generateInstanceId(),
      consumes: [],
      produces: [],
    };
  }
}
```

**Constraints check**: ~50 lines ✓, max 50 lines per method ✓, 2 indent levels ✓, max 2 params ✓

### Step 5: Create `src/testing/mock-discovery-event-publisher.service.ts`

```ts
import { Injectable } from '@nestjs/common';
import { ServiceManifestDto } from '../discovery/dto/service-manifest.dto';
import { EventEnvelope } from '../common/envelope/event-envelope.class';
import { generateEventId, generateUuidV7 } from '../common/utils/uuid.utils';
import { nowIso } from '../common/utils/date.utils';
import { ActorType } from '../common/envelope/actor-type.enum';
import { PLATFORM_REGISTER_SUBJECT, PLATFORM_HEARTBEAT_SUBJECT, PLATFORM_SHUTDOWN_SUBJECT } from '../discovery/events/platform-event-subjects';
import { PlatformEventType } from '../discovery/events/platform-event-types';
import { PLATFORM_COMPANY_ID, PLATFORM_ACTOR_ID } from '../discovery/events/discovery-payloads.interface';
import { MockProducerService } from './mock-producer.service';

/**
 * In-memory mock for DiscoveryEventPublisher.
 *
 * Publishes platform discovery events through MockProducerService so tests
 * can capture and assert on registration, heartbeat, and shutdown events.
 */
@Injectable()
export class MockDiscoveryEventPublisher {
  constructor(private readonly producer: MockProducerService) {}

  /** Publishes a platform.service.register.v1 event carrying the full service manifest. */
  async publishRegistration(manifest: ServiceManifestDto): Promise<void> {
    const envelope = this.buildEnvelope(PlatformEventType.REGISTER, manifest.name, manifest);
    await this.producer.publish(PLATFORM_REGISTER_SUBJECT, envelope);
  }

  /** Publishes a platform.service.heartbeat.v1 liveness event. */
  async publishHeartbeat(manifest: ServiceManifestDto): Promise<void> {
    const payload = { name: manifest.name, version: manifest.version, instanceId: manifest.instanceId, timestamp: nowIso() };
    const envelope = this.buildEnvelope(PlatformEventType.HEARTBEAT, manifest.name, payload);
    await this.producer.publish(PLATFORM_HEARTBEAT_SUBJECT, envelope);
  }

  /** Publishes a platform.service.shutdown.v1 graceful-shutdown event. */
  async publishShutdown(manifest: ServiceManifestDto): Promise<void> {
    const payload = { name: manifest.name, version: manifest.version, instanceId: manifest.instanceId, timestamp: nowIso() };
    const envelope = this.buildEnvelope(PlatformEventType.SHUTDOWN, manifest.name, payload);
    await this.producer.publish(PLATFORM_SHUTDOWN_SUBJECT, envelope);
  }

  private buildEnvelope(eventType: string, producerName: string, data: unknown): EventEnvelope<unknown> {
    return new EventEnvelope<unknown>({
      id: generateEventId(),
      type: eventType,
      version: '1',
      produced_at: nowIso(),
      producer: producerName,
      company_id: PLATFORM_COMPANY_ID,
      actor_type: ActorType.SYSTEM,
      actor_id: PLATFORM_ACTOR_ID,
      correlation_id: generateUuidV7(),
      data,
    });
  }
}
```

**Constraints check**: ~55 lines — need to verify it's under 200 ✓, methods < 50 lines ✓, 2 indent levels ✓, max 2 params: `buildEnvelope` has 3 params. Need to refactor.

**Refactoring `buildEnvelope` to comply with max 2 params**:

Extract the 3-param method into a param object pattern:

```ts
/** Parameters for building a platform event envelope. */
interface PlatformEnvelopeParams {
  eventType: string;
  producerName: string;
  data: unknown;
}

// In class:
private buildEnvelope(params: PlatformEnvelopeParams): EventEnvelope<unknown> {
  return new EventEnvelope<unknown>({
    id: generateEventId(),
    type: params.eventType,
    version: '1',
    produced_at: nowIso(),
    producer: params.producerName,
    company_id: PLATFORM_COMPANY_ID,
    actor_type: ActorType.SYSTEM,
    actor_id: PLATFORM_ACTOR_ID,
    correlation_id: generateUuidV7(),
    data: params.data,
  });
}
```

Updated call sites:
```ts
await this.producer.publish(PLATFORM_REGISTER_SUBJECT, this.buildEnvelope({ eventType: PlatformEventType.REGISTER, producerName: manifest.name, data: manifest }));
```

**Constraint check revised**: max 2 params ✓

### Step 6: Create `src/testing/mock-discovery.service.ts`

```ts
import { Injectable } from '@nestjs/common';
import { ServiceManifestDto } from '../discovery/dto/service-manifest.dto';
import { ServiceInfo } from '../discovery/service-info.interface';
import { MockManifestService } from './mock-manifest.service';
import { MockDiscoveryEventPublisher } from './mock-discovery-event-publisher.service';

/** Configuration for the mock discovery service. */
export interface MockDiscoveryServiceConfig {
  /** Whether discovery is enabled. Default: true. */
  enabled?: boolean;
  /** Service identity for manifest generation. */
  serviceInfo?: ServiceInfo;
}

/**
 * In-memory mock for DiscoveryService.
 *
 * Provides explicit trigger methods instead of auto-running NestJS lifecycle
 * hooks, giving tests full control over when startup, heartbeat, and shutdown
 * events are published.
 */
@Injectable()
export class MockDiscoveryService {
  private cachedManifest: ServiceManifestDto | null = null;
  private readonly enabled: boolean;
  private readonly serviceInfo: ServiceInfo;

  constructor(
    private readonly manifestService: MockManifestService,
    private readonly eventPublisher: MockDiscoveryEventPublisher,
    config?: MockDiscoveryServiceConfig,
  ) {
    this.enabled = config?.enabled ?? true;
    this.serviceInfo = config?.serviceInfo ?? { name: 'test-service', version: '1.0.0' };
  }

  /** Generates and caches the service manifest using MockManifestService. */
  generateManifest(): ServiceManifestDto {
    this.cachedManifest = this.manifestService.generateManifest(this.serviceInfo);
    return this.cachedManifest;
  }

  /** Returns the cached manifest, generating one if not yet cached. */
  getManifest(): ServiceManifestDto {
    if (this.cachedManifest) {
      return this.cachedManifest;
    }
    return this.generateManifest();
  }

  /** Simulates application startup: generates manifest and publishes registration event. */
  async triggerStartup(): Promise<void> {
    if (!this.enabled) {
      return;
    }
    const manifest = this.getManifest();
    await this.eventPublisher.publishRegistration(manifest);
  }

  /** Simulates a single heartbeat event. */
  async triggerHeartbeat(): Promise<void> {
    if (!this.enabled) {
      return;
    }
    const manifest = this.getManifest();
    await this.eventPublisher.publishHeartbeat(manifest);
  }

  /** Simulates graceful shutdown: publishes shutdown event. */
  async triggerShutdown(): Promise<void> {
    if (!this.enabled) {
      return;
    }
    const manifest = this.cachedManifest;
    if (!manifest) {
      return;
    }
    await this.eventPublisher.publishShutdown(manifest);
  }

  /** Resets all internal state including cached manifest. */
  clear(): void {
    this.cachedManifest = null;
  }
}
```

**Constraints check**: ~75 lines ✓, methods < 50 lines ✓, 2 indent levels ✓
- Constructor has 3 params (`manifestService`, `eventPublisher`, `config`). Refactor to 2 using param object pattern.

**Refactoring to max 2 params**:

```ts
/** Dependencies injected into MockDiscoveryService. */
export interface MockDiscoveryServiceDeps {
  manifestService: MockManifestService;
  eventPublisher: MockDiscoveryEventPublisher;
}

// Constructor:
constructor(deps: MockDiscoveryServiceDeps, config?: MockDiscoveryServiceConfig) {
```

Updated method calls:
```ts
this.manifestService → deps.manifestService (store as private field)
this.eventPublisher → deps.eventPublisher (store as private field)
```

Actually, better to destructure and store:

```ts
private readonly manifestService: MockManifestService;
private readonly eventPublisher: MockDiscoveryEventPublisher;

constructor(
  { manifestService, eventPublisher }: MockDiscoveryServiceDeps,
  config?: MockDiscoveryServiceConfig,
) {
  this.manifestService = manifestService;
  this.eventPublisher = eventPublisher;
  this.enabled = config?.enabled ?? true;
  this.serviceInfo = config?.serviceInfo ?? { name: 'test-service', version: '1.0.0' };
}
```

### Step 7: Create `src/testing/discovery-assertion.helpers.ts`

```ts
import { expect } from '@jest/globals';
import { MockProducerService } from './mock-producer.service';
import { PublishedEvent } from './published-event.interface';
import {
  PLATFORM_REGISTER_SUBJECT,
  PLATFORM_HEARTBEAT_SUBJECT,
  PLATFORM_SHUTDOWN_SUBJECT,
} from '../discovery/events/platform-event-subjects';
import { ServiceManifestDto } from '../discovery/dto/service-manifest.dto';

/** Asserts that a platform.service.register.v1 event was published. */
export function expectRegistrationPublished(producer: MockProducerService): void {
  expectEventPublished(producer, PLATFORM_REGISTER_SUBJECT);
}

/** Asserts that a platform.service.heartbeat.v1 event was published. */
export function expectHeartbeatPublished(producer: MockProducerService): void {
  expectEventPublished(producer, PLATFORM_HEARTBEAT_SUBJECT);
}

/** Asserts that a platform.service.shutdown.v1 event was published. */
export function expectShutdownPublished(producer: MockProducerService): void {
  expectEventPublished(producer, PLATFORM_SHUTDOWN_SUBJECT);
}

/** Returns all registration events published by the producer. */
export function getRegistrationEvents(producer: MockProducerService): ReadonlyArray<PublishedEvent> {
  return producer.getPublishedEventsBySubject(PLATFORM_REGISTER_SUBJECT);
}

/** Returns all heartbeat events published by the producer. */
export function getHeartbeatEvents(producer: MockProducerService): ReadonlyArray<PublishedEvent> {
  return producer.getPublishedEventsBySubject(PLATFORM_HEARTBEAT_SUBJECT);
}

/** Returns the manifest data from the first registration event, or undefined if none. */
export function getRegistrationManifest(producer: MockProducerService): ServiceManifestDto | undefined {
  const events = getRegistrationEvents(producer);
  if (events.length === 0) {
    return undefined;
  }
  return events[0].event.data as ServiceManifestDto;
}

/** Asserts that a registration event was published with the expected service name. */
export function expectRegistrationWithServiceName(producer: MockProducerService, serviceName: string): void {
  const manifest = getRegistrationManifest(producer);
  expect(manifest).toBeDefined();
  expect(manifest!.name).toBe(serviceName);
}

function expectEventPublished(producer: MockProducerService, subject: string): void {
  const events = producer.getPublishedEventsBySubject(subject);
  expect(events.length).toBeGreaterThan(0);
}
```

**Constraints check**: ~65 lines ✓, methods < 50 lines ✓, 2 indent levels ✓, max 2 params ✓

> Note: The `expectEventPublished` local function here is different from the one in `assertion.helpers.ts` (which uses `getPublishedEvents()` + filter). This local one uses `getPublishedEventsBySubject()` directly. Alternatively, we could import from `assertion.helpers.ts` — let's compare:

`assertion.helpers.ts::expectEventPublished(producer, subject)` already does:
```ts
const events = producer.getPublishedEvents();
const matching = events.filter((e) => e.subject === subject);
expect(matching.length).toBeGreaterThan(0);
```

We can reuse it. Change the local function to import from `assertion.helpers.ts`:

```ts
import { expectEventPublished } from './assertion.helpers';
```

Then remove the local `expectEventPublished` and use the imported one. The discovery helpers become simpler wrappers.

### Step 8: Create spec file `src/testing/mock-manifest.service.spec.ts`

```ts
import { MockManifestService } from './mock-manifest.service';
import { ServiceInfo } from '../discovery/service-info.interface';
import { ServiceManifestDto } from '../discovery/dto/service-manifest.dto';

describe('MockManifestService', () => {
  let service: MockManifestService;
  const defaultServiceInfo: ServiceInfo = { name: 'test-service', version: '1.0.0' };

  beforeEach(() => {
    service = new MockManifestService();
  });

  it('generates a minimal manifest from ServiceInfo', () => {
    const manifest = service.generateManifest(defaultServiceInfo);
    expect(manifest.name).toBe('test-service');
    expect(manifest.version).toBe('1.0.0');
    expect(manifest.description).toBe('');
    expect(manifest.consumes).toEqual([]);
    expect(manifest.produces).toEqual([]);
  });

  it('uses description from serviceInfo when provided', () => {
    const info: ServiceInfo = { name: 'svc', version: '2.0.0', description: 'A test service' };
    const manifest = service.generateManifest(info);
    expect(manifest.description).toBe('A test service');
  });

  it('uses provided instanceId when available', () => {
    const info: ServiceInfo = { name: 'svc', version: '1.0.0', instanceId: 'inst-123' };
    const manifest = service.generateManifest(info);
    expect(manifest.instanceId).toBe('inst-123');
  });

  it('returns the configured default manifest when set', () => {
    const configured: ServiceManifestDto = {
      name: 'custom',
      version: '3.0.0',
      description: 'Custom',
      instanceId: 'inst-456',
      consumes: [],
      produces: [],
    };
    service.setDefaultManifest(configured);
    const manifest = service.generateManifest(defaultServiceInfo);
    expect(manifest).toEqual(configured);
  });

  it('clearDefaultManifest restores auto-generation', () => {
    service.setDefaultManifest({ name: 'x', version: '1', description: '', instanceId: 'i1', consumes: [], produces: [] });
    service.clearDefaultManifest();
    const manifest = service.generateManifest(defaultServiceInfo);
    expect(manifest.name).toBe('test-service');
  });

  it('clear resets all state', () => {
    service.setDefaultManifest({ name: 'x', version: '1', description: '', instanceId: 'i1', consumes: [], produces: [] });
    service.clear();
    const manifest = service.generateManifest(defaultServiceInfo);
    expect(manifest.name).toBe('test-service');
  });
});
```

### Step 9: Create spec file `src/testing/mock-discovery-event-publisher.service.spec.ts`

```ts
import { MockDiscoveryEventPublisher } from './mock-discovery-event-publisher.service';
import { MockProducerService } from './mock-producer.service';
import { ServiceManifestDto } from '../discovery/dto/service-manifest.dto';
import { PLATFORM_REGISTER_SUBJECT, PLATFORM_HEARTBEAT_SUBJECT, PLATFORM_SHUTDOWN_SUBJECT } from '../discovery/events/platform-event-subjects';
import { PlatformEventType } from '../discovery/events/platform-event-types';

describe('MockDiscoveryEventPublisher', () => {
  let publisher: MockDiscoveryEventPublisher;
  let producer: MockProducerService;
  const testManifest: ServiceManifestDto = {
    name: 'test-service',
    version: '1.0.0',
    description: 'Test',
    instanceId: 'inst-001',
    consumes: [],
    produces: [],
  };

  beforeEach(() => {
    producer = new MockProducerService();
    publisher = new MockDiscoveryEventPublisher(producer);
  });

  it('publishes registration event to platform.service.register.v1', async () => {
    await publisher.publishRegistration(testManifest);
    const events = producer.getPublishedEventsBySubject(PLATFORM_REGISTER_SUBJECT);
    expect(events.length).toBe(1);
    expect(events[0].event.type).toBe(PlatformEventType.REGISTER);
    expect(events[0].event.data).toEqual(testManifest);
  });

  it('publishes heartbeat event to platform.service.heartbeat.v1', async () => {
    await publisher.publishHeartbeat(testManifest);
    const events = producer.getPublishedEventsBySubject(PLATFORM_HEARTBEAT_SUBJECT);
    expect(events.length).toBe(1);
    expect(events[0].event.type).toBe(PlatformEventType.HEARTBEAT);
  });

  it('publishes shutdown event to platform.service.shutdown.v1', async () => {
    await publisher.publishShutdown(testManifest);
    const events = producer.getPublishedEventsBySubject(PLATFORM_SHUTDOWN_SUBJECT);
    expect(events.length).toBe(1);
    expect(events[0].event.type).toBe(PlatformEventType.SHUTDOWN);
  });
});
```

### Step 10: Create spec file `src/testing/mock-discovery.service.spec.ts`

```ts
import { MockDiscoveryService, MockDiscoveryServiceDeps } from './mock-discovery.service';
import { MockManifestService } from './mock-manifest.service';
import { MockDiscoveryEventPublisher } from './mock-discovery-event-publisher.service';
import { MockProducerService } from './mock-producer.service';
import { PLATFORM_REGISTER_SUBJECT, PLATFORM_HEARTBEAT_SUBJECT, PLATFORM_SHUTDOWN_SUBJECT } from '../discovery/events/platform-event-subjects';

describe('MockDiscoveryService', () => {
  let service: MockDiscoveryService;
  let manifestService: MockManifestService;
  let eventPublisher: MockDiscoveryEventPublisher;
  let producer: MockProducerService;

  beforeEach(() => {
    producer = new MockProducerService();
    manifestService = new MockManifestService();
    eventPublisher = new MockDiscoveryEventPublisher(producer);
    const deps: MockDiscoveryServiceDeps = { manifestService, eventPublisher };
    service = new MockDiscoveryService(deps);
  });

  it('generateManifest returns a manifest with default service info', () => {
    const manifest = service.generateManifest();
    expect(manifest.name).toBe('test-service');
  });

  it('triggerStartup publishes registration event', async () => {
    await service.triggerStartup();
    const events = producer.getPublishedEventsBySubject(PLATFORM_REGISTER_SUBJECT);
    expect(events.length).toBe(1);
  });

  it('triggerHeartbeat publishes heartbeat event', async () => {
    await service.triggerHeartbeat();
    const events = producer.getPublishedEventsBySubject(PLATFORM_HEARTBEAT_SUBJECT);
    expect(events.length).toBe(1);
  });

  it('triggerShutdown publishes shutdown event when manifest exists', async () => {
    service.generateManifest();
    await service.triggerStartup();
    await service.triggerShutdown();
    const events = producer.getPublishedEventsBySubject(PLATFORM_SHUTDOWN_SUBJECT);
    expect(events.length).toBe(1);
  });

  it('does not publish events when disabled', async () => {
    const disabledService = new MockDiscoveryService(
      { manifestService, eventPublisher },
      { enabled: false },
    );
    await disabledService.triggerStartup();
    expect(producer.count).toBe(0);
  });

  it('clear resets cached manifest', () => {
    service.generateManifest();
    service.clear();
    // After clear, getManifest should generate a new one
    const manifest = service.getManifest();
    expect(manifest).toBeDefined();
  });
});
```

### Step 11: Create spec file `src/testing/discovery-assertion.helpers.spec.ts`

```ts
import { MockProducerService } from './mock-producer.service';
import { MockDiscoveryEventPublisher } from './mock-discovery-event-publisher.service';
import { ServiceManifestDto } from '../discovery/dto/service-manifest.dto';
import { PLATFORM_REGISTER_SUBJECT, PLATFORM_HEARTBEAT_SUBJECT } from '../discovery/events/platform-event-subjects';
import {
  expectRegistrationPublished,
  expectHeartbeatPublished,
  getRegistrationEvents,
  getHeartbeatEvents,
  getRegistrationManifest,
  expectRegistrationWithServiceName,
} from './discovery-assertion.helpers';

describe('discovery assertion helpers', () => {
  let producer: MockProducerService;
  let publisher: MockDiscoveryEventPublisher;
  const manifest: ServiceManifestDto = {
    name: 'payment-service',
    version: '1.0.0',
    description: 'Test',
    instanceId: 'inst-001',
    consumes: [],
    produces: [],
  };

  beforeEach(() => {
    producer = new MockProducerService();
    publisher = new MockDiscoveryEventPublisher(producer);
  });

  describe('expectRegistrationPublished', () => {
    it('passes when registration event exists', async () => {
      await publisher.publishRegistration(manifest);
      expect(() => expectRegistrationPublished(producer)).not.toThrow();
    });

    it('fails when no registration event', () => {
      expect(() => expectRegistrationPublished(producer)).toThrow();
    });
  });

  describe('expectHeartbeatPublished', () => {
    it('passes when heartbeat event exists', async () => {
      await publisher.publishHeartbeat(manifest);
      expect(() => expectHeartbeatPublished(producer)).not.toThrow();
    });
  });

  describe('getRegistrationEvents', () => {
    it('returns registration events', async () => {
      await publisher.publishRegistration(manifest);
      const events = getRegistrationEvents(producer);
      expect(events.length).toBe(1);
      expect(events[0].subject).toBe(PLATFORM_REGISTER_SUBJECT);
    });
  });

  describe('getHeartbeatEvents', () => {
    it('returns heartbeat events', async () => {
      await publisher.publishHeartbeat(manifest);
      const events = getHeartbeatEvents(producer);
      expect(events.length).toBe(1);
    });
  });

  describe('getRegistrationManifest', () => {
    it('returns manifest data from first registration event', async () => {
      await publisher.publishRegistration(manifest);
      const result = getRegistrationManifest(producer);
      expect(result).toBeDefined();
      expect(result!.name).toBe('payment-service');
    });

    it('returns undefined when no registration events', () => {
      const result = getRegistrationManifest(producer);
      expect(result).toBeUndefined();
    });
  });

  describe('expectRegistrationWithServiceName', () => {
    it('passes when service name matches', async () => {
      await publisher.publishRegistration(manifest);
      expect(() => expectRegistrationWithServiceName(producer, 'payment-service')).not.toThrow();
    });

    it('fails when service name does not match', async () => {
      await publisher.publishRegistration(manifest);
      expect(() => expectRegistrationWithServiceName(producer, 'other-service')).toThrow();
    });
  });
});
```

### Step 12: Add test for `getPublishedEventsBySubject()` in `src/testing/mock-producer.service.spec.ts`

Verify the existing spec file structure first, then add:

```ts
describe('getPublishedEventsBySubject', () => {
  it('returns events matching the subject', async () => {
    await producer.publish('platform.service.register.v1', createTestEnvelope());
    await producer.publish('platform.service.heartbeat.v1', createTestEnvelope());
    await producer.publish('platform.service.register.v1', createTestEnvelope());

    const result = producer.getPublishedEventsBySubject('platform.service.register.v1');
    expect(result.length).toBe(2);
  });

  it('returns empty array when no events match', () => {
    const result = producer.getPublishedEventsBySubject('nonexistent.subject');
    expect(result).toEqual([]);
  });
});
```

### Step 13: Modify `src/testing/events-toolkit-test.module.ts`

Replace current implementation with options-aware version:

```ts
import { DynamicModule } from '@nestjs/common';
import { ProducerService } from '../producer/producer.service';
import { ConsumerService } from '../consumer/consumer.service';
import { OutboxService } from '../outbox/outbox.service';
import { RequestReplyService } from '../request-reply/request-reply.service';
import { EventLoggerService } from '../logging/event-logger.service';
import { ManifestService } from '../discovery/manifest.service';
import { DiscoveryService } from '../discovery/discovery.service';
import { DiscoveryEventPublisher } from '../discovery/events/discovery-event-publisher.service';
import { MockProducerService } from './mock-producer.service';
import { MockConsumerService } from './mock-consumer.service';
import { MockEventLoggerService } from './mock-event-logger.service';
import { MockOutboxService } from './mock-outbox.service';
import { MockRequestReplyService } from './mock-request-reply.service';
import { MockManifestService } from './mock-manifest.service';
import { MockDiscoveryService, MockDiscoveryServiceDeps } from './mock-discovery.service';
import { MockDiscoveryEventPublisher } from './mock-discovery-event-publisher.service';
import { EventsToolkitTestModuleOptions } from './events-toolkit-test-options.interface';

/**
 * NestJS dynamic module registering mock services for all events-toolkit subsystems.
 *
 * Uses `useExisting` to alias each mock as its real service token, so application
 * code receives mocks transparently without import changes.
 *
 * @example
 * ```typescript
 * // With discovery mocks enabled (default):
 * const module = await Test.createTestingModule({
 *   imports: [EventsToolkitTestModule.forRoot()],
 *   providers: [MyService],
 * }).compile();
 *
 * // With discovery disabled:
 * const module = await Test.createTestingModule({
 *   imports: [EventsToolkitTestModule.forRoot({ discovery: { enabled: false } })],
 *   providers: [MyService],
 * }).compile();
 * ```
 */
export class EventsToolkitTestModule {
  /**
   * Creates a global dynamic module with all mock service providers.
   * @param options - Configuration for which mock subsystems to include.
   * @returns A DynamicModule that exports both mock and real service tokens.
   */
  static forRoot(options?: EventsToolkitTestModuleOptions): DynamicModule {
    const discoveryEnabled = options?.discovery?.enabled !== false;
    return {
      module: EventsToolkitTestModule,
      global: true,
      providers: this.buildProviders(discoveryEnabled, options),
      exports: this.buildExports(discoveryEnabled),
    };
  }

  private static buildProviders(discoveryEnabled: boolean, options?: EventsToolkitTestModuleOptions): Provider[] {
    const providers: Provider[] = [
      MockProducerService,
      { provide: ProducerService, useExisting: MockProducerService },
      MockConsumerService,
      { provide: ConsumerService, useExisting: MockConsumerService },
      MockEventLoggerService,
      { provide: EventLoggerService, useExisting: MockEventLoggerService },
      MockOutboxService,
      { provide: OutboxService, useExisting: MockOutboxService },
      MockRequestReplyService,
      { provide: RequestReplyService, useExisting: MockRequestReplyService },
    ];
    if (discoveryEnabled) {
      providers.push(...this.buildDiscoveryProviders(options));
    }
    return providers;
  }

  private static buildDiscoveryProviders(options?: EventsToolkitTestModuleOptions): Provider[] {
    const serviceInfo = options?.discovery?.serviceInfo;
    return [
      MockManifestService,
      { provide: ManifestService, useExisting: MockManifestService },
      MockDiscoveryEventPublisher,
      {
        provide: MockDiscoveryService,
        useFactory: (deps: MockDiscoveryServiceDeps) => new MockDiscoveryService(deps, { enabled: true, serviceInfo }),
        inject: [MockManifestService, MockDiscoveryEventPublisher],
        // Note: useFactory inject must match constructor params. Refactor using factory pattern.
      },
      { provide: DiscoveryService, useExisting: MockDiscoveryService },
      { provide: DiscoveryEventPublisher, useExisting: MockDiscoveryEventPublisher },
    ];
  }

  private static buildExports(discoveryEnabled: boolean): Type<unknown>[] {
    const exports: Type<unknown>[] = [
      MockProducerService, ProducerService,
      MockConsumerService, ConsumerService,
      MockEventLoggerService, EventLoggerService,
      MockOutboxService, OutboxService,
      MockRequestReplyService, RequestReplyService,
    ];
    if (discoveryEnabled) {
      exports.push(MockManifestService, ManifestService);
      exports.push(MockDiscoveryService, DiscoveryService);
      exports.push(MockDiscoveryEventPublisher, DiscoveryEventPublisher);
    }
    return exports;
  }
}
```

> **ISSUE**: The `useFactory` approach for `MockDiscoveryService` needs careful handling. `MockDiscoveryService` constructor takes `MockDiscoveryServiceDeps` and `MockDiscoveryServiceConfig`. The NestJS factory needs to inject `MockManifestService` and `MockDiscoveryEventPublisher` to build the deps. Let me revise:

```ts
private static buildDiscoveryProviders(options?: EventsToolkitTestModuleOptions): Provider[] {
  const serviceInfo = options?.discovery?.serviceInfo;
  return [
    MockManifestService,
    { provide: ManifestService, useExisting: MockManifestService },
    MockDiscoveryEventPublisher,
    { provide: DiscoveryEventPublisher, useExisting: MockDiscoveryEventPublisher },
    {
      provide: MockDiscoveryService,
      useFactory: (manifestService: MockManifestService, eventPublisher: MockDiscoveryEventPublisher) => {
        const deps: MockDiscoveryServiceDeps = { manifestService, eventPublisher };
        return new MockDiscoveryService(deps, { enabled: true, serviceInfo });
      },
      inject: [MockManifestService, MockDiscoveryEventPublisher],
    },
    { provide: DiscoveryService, useExisting: MockDiscoveryService },
  ];
}
```

Also need to import `Provider` and `Type` from `@nestjs/common`.

**Constraints check**: ~110 lines ✓, methods < 50 lines ✓, 2 indent levels ✓, max 2 params ✓

### Step 14: Update spec file `src/testing/events-toolkit-test.module.spec.ts`

Add tests for discovery providers when enabled and not enabled:

```ts
// New imports
import { ManifestService } from '../discovery/manifest.service';
import { DiscoveryService } from '../discovery/discovery.service';
import { DiscoveryEventPublisher } from '../discovery/events/discovery-event-publisher.service';
import { MockManifestService } from './mock-manifest.service';
import { MockDiscoveryService } from './mock-discovery.service';
import { MockDiscoveryEventPublisher } from './mock-discovery-event-publisher.service';

// Add describe block:
describe('with discovery enabled (default)', () => {
  it('provides MockManifestService as ManifestService', async () => {
    const module = await Test.createTestingModule({
      imports: [EventsToolkitTestModule.forRoot()],
    }).compile();

    const manifest = module.get(ManifestService);
    expect(manifest).toBeInstanceOf(MockManifestService);
  });

  it('provides MockDiscoveryService as DiscoveryService', async () => {
    const module = await Test.createTestingModule({
      imports: [EventsToolkitTestModule.forRoot()],
    }).compile();

    const discovery = module.get(DiscoveryService);
    expect(discovery).toBeInstanceOf(MockDiscoveryService);
  });

  it('provides MockDiscoveryEventPublisher as DiscoveryEventPublisher', async () => {
    const module = await Test.createTestingModule({
      imports: [EventsToolkitTestModule.forRoot()],
    }).compile();

    const publisher = module.get(DiscoveryEventPublisher);
    expect(publisher).toBeInstanceOf(MockDiscoveryEventPublisher);
  });
});

describe('with discovery disabled', () => {
  it('does not provide ManifestService', async () => {
    const module = await Test.createTestingModule({
      imports: [EventsToolkitTestModule.forRoot({ discovery: { enabled: false } })],
    }).compile();

    expect(() => module.get(ManifestService)).toThrow();
  });
});
```

### Step 15: Update `src/testing/index.ts`

Add the following exports:

```ts
export { MockManifestService } from './mock-manifest.service';
export { MockDiscoveryEventPublisher } from './mock-discovery-event-publisher.service';
export { MockDiscoveryService, MockDiscoveryServiceDeps, MockDiscoveryServiceConfig } from './mock-discovery.service';
export { EventsToolkitTestModuleOptions, DiscoveryTestOptions } from './events-toolkit-test-options.interface';
export {
  expectRegistrationPublished,
  expectHeartbeatPublished,
  expectShutdownPublished,
  getRegistrationEvents,
  getHeartbeatEvents,
  getRegistrationManifest,
  expectRegistrationWithServiceName,
} from './discovery-assertion.helpers';
```

### Step 16: Run build, typecheck, and tests

```bash
npm run build
npm run typecheck
npm run test
```

Fix any errors found.

### Step 17: Commit

```
feat(testing): add discovery mock services and assertion helpers

- MockManifestService: configurable manifest generation for tests
- MockDiscoveryEventPublisher: publishes platform events via MockProducerService
- MockDiscoveryService: explicit lifecycle trigger methods for test control
- Discovery assertion helpers: expectRegistrationPublished, expectHeartbeatPublished, etc.
- EventsToolkitTestModule.forRoot(options): supports discovery enabled/disabled config
- MockProducerService: added getPublishedEventsBySubject() method
```

---

## Constraint Verification

| Constraint | Status |
|---|---|
| Max 200 lines per src file | ✓ All files under 120 lines |
| Max 50 lines per method | ✓ All methods under 30 lines |
| Max 2 indentation levels | ✓ Verified |
| Max 2 params per method | ✓ Refactored buildEnvelope and MockDiscoveryService constructor to use param objects |
| Private members by default | ✓ All internal methods are private |
| Self-documenting code | ✓ Method names are descriptive |
| No commented code | ✓ No commented-out code |
| Max depth 2 | ✓ No method exceeds 2 levels of nesting |

## Key Design Decisions

1. **MockDiscoveryService uses explicit trigger methods** (`triggerStartup`, `triggerHeartbeat`, `triggerShutdown`) instead of NestJS lifecycle hooks. This gives tests full control over when events fire, unlike the real `DiscoveryService` which auto-triggers on module lifecycle.

2. **MockDiscoveryEventPublisher delegates to MockProducerService** rather than being a standalone recorder. This means platform events appear in `MockProducerService.getPublishedEvents()`, enabling assertions through both the producer and the dedicated discovery helpers.

3. **EventsToolkitTestModule.forRoot(options?)** defaults to discovery enabled. When `discovery.enabled === false`, no discovery mocks are registered, and injection of `ManifestService`, `DiscoveryService`, or `DiscoveryEventPublisher` will fail (as expected when the subsystem is not configured).

4. **`getPublishedEventsBySubject`** on `MockProducerService` provides the foundation for the discovery assertion helpers, filtering published events by NATS subject.