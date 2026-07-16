/**
 * End-to-end runtime regression test for `EventsToolkitModule.forRootAsync`.
 *
 * Boots the full toolkit through NestJS lifecycle (`init()`) with mocked NATS
 * and SQLite outbox, then verifies the two runtime bugs fixed alongside this
 * test do not regress:
 *
 * 1. `OnEventExplorer` / `OnRequestReplyExplorer` must skip getter/setter
 *    accessor properties instead of throwing during prototype scanning. The
 *    fix uses `Object.getOwnPropertyDescriptor` which does not invoke
 *    accessors, handling throwing getters like
 *    `HttpAdapterHost.prototype.listen$` which reads `this._listen$`
 *    (undefined on the prototype). Guarded by a test provider that declares
 *    accessor properties alongside `@OnEvent` and `@OnRequestReply` handlers,
 *    including a throwing `listen$` getter that reproduces the exact crash.
 * 2. `JetStreamConsumerService` / `RequestReplyConsumerService` must pass
 *    valid consumer options (never `{}`) to `jetStream.subscribe`, so NATS
 *    never reads `undefined.ack_policy`.
 *
 * AI AGENT NOTE: This file owns a richer `nats` mock (with `consumerOpts`,
 * `AckPolicy`, and `createInbox`) than `events-toolkit.module.e2e-spec.ts`.
 * Keep them separate — `jest.mock` is file-scoped and the DI spec intentionally
 * mocks a minimal `nats` surface.
 */
import 'reflect-metadata';
import { Test, TestingModule } from '@nestjs/testing';
import { ConsumerOpts } from 'nats';
import { EventsToolkitModule } from './events-toolkit.module';
import { EventsToolkitModuleAsyncOptions } from './events-toolkit-options.interface';
import { ConsumerService } from './consumer/consumer.service';
import { JetStreamConsumerService } from './consumer/jetstream-consumer.service';
import { RequestReplyConsumerService } from './consumer/request-reply-consumer.service';
import { isConsumerOptsBuilder } from './consumer/subscribe-options.interface';
import { HandlerWithAccessorsProvider } from './events-toolkit.runtime.e2e-fixtures';

const RESPONSE_SUBJECT = 'company.*.response.v1';

jest.mock('nats', () => {
  const subscribe = jest.fn().mockResolvedValue((async function* () {})());
  const ackPolicyExplicit = 'Explicit';
  const builder = {
    manualAck() {
      return builder;
    },
    ackExplicit() {
      return builder;
    },
    deliverTo() {
      return builder;
    },
    getOpts() {
      return { config: { ack_policy: ackPolicyExplicit } };
    },
  };
  return {
    _subscribeFn: subscribe,
    AckPolicy: { Explicit: ackPolicyExplicit, All: 'All', None: 'None' },
    createInbox: () => '_INBOX.test',
    consumerOpts: () => builder,
    connect: jest.fn().mockResolvedValue({
      jetstream: jest.fn().mockReturnValue({
        publish: jest.fn(),
        subscribe,
      }),
      request: jest.fn(),
      close: jest.fn(),
    }),
  };
});

jest.mock('./outbox/sqlite-outbox.repository', () => ({
  SqliteOutboxRepository: jest.fn().mockImplementation(() => ({
    save: jest.fn(),
    getPending: jest.fn().mockResolvedValue([]),
    markAsSent: jest.fn(),
    markAsFailed: jest.fn(),
  })),
}));

function buildForRootAsyncOptions(): EventsToolkitModuleAsyncOptions {
  return {
    useFactory: async () => ({
      nats: { servers: ['nats://localhost:4222'] },
      consumer: { enable: true },
      discovery: { enabled: true, registerOnStartup: false },
    }),
  };
}

async function compileToolkit(): Promise<TestingModule> {
  return Test.createTestingModule({
    imports: [EventsToolkitModule.forRootAsync(buildForRootAsyncOptions())],
    providers: [HandlerWithAccessorsProvider],
  }).compile();
}

function hasValidConsumerConfig(arg: unknown): boolean {
  if (isConsumerOptsBuilder(arg)) return true;
  return argHasAckPolicy(arg);
}

function argHasAckPolicy(arg: unknown): boolean {
  const config = (arg as { config?: { ack_policy?: unknown } })?.config;
  return Boolean(config?.ack_policy);
}

function resolveSubscribe(): jest.Mock {
  return (jest.requireMock('nats') as { _subscribeFn: jest.Mock })._subscribeFn;
}

describe('EventsToolkitModule.forRootAsync runtime e2e', () => {
  let moduleRef: TestingModule;

  beforeEach(async () => {
    moduleRef = await compileToolkit();
    await moduleRef.init();
  });

  afterEach(async () => {
    if (moduleRef) {
      await moduleRef.close();
    }
    jest.clearAllMocks();
  });

  it('boots without throwing when providers declare getter/setter accessors', () => {
    expect(moduleRef).toBeDefined();
  });

  it('registers the @OnEvent handler from a provider with accessor properties', () => {
    const consumerService = moduleRef.get(ConsumerService);
    expect(consumerService.getHandler('company.*.payment.proof.uploaded.v1')).toBeDefined();
  });

  it('registers the @OnRequestReply handler from a provider with accessor properties', () => {
    const requestReplyConsumer = moduleRef.get(RequestReplyConsumerService);
    expect(requestReplyConsumer.getHandler('payment.proof.uploaded')).toBeDefined();
  });

  it('passes valid consumer options (never {}) to jetStream.subscribe on auto-subscribe', () => {
    const subscribeMock = resolveSubscribe();
    const rrCall = findSubscribeCall(subscribeMock, RESPONSE_SUBJECT);
    expect(rrCall).toBeDefined();
    const opts = rrCall?.[1];
    expect(opts).not.toEqual({});
    expect(hasValidConsumerConfig(opts)).toBe(true);
  });

  it('normalizes an empty {} consumerOpts into an ack_policy-bearing config', async () => {
    const jetStreamConsumer = moduleRef.get(JetStreamConsumerService);
    const subject = 'company.*.payment.proof.uploaded.v1';
    await jetStreamConsumer.subscribe({
      subject,
      handler: async () => {
        void 0;
      },
      consumerOpts: {} as Partial<ConsumerOpts>,
    });
    const subscribeMock = resolveSubscribe();
    const lastCall = findSubscribeCall(subscribeMock, subject);
    const opts = lastCall?.[1];
    expect(opts).not.toEqual({});
    expect(hasValidConsumerConfig(opts)).toBe(true);
  });

  function findSubscribeCall(subscribeMock: jest.Mock, subject: string): readonly unknown[] | undefined {
    return subscribeMock.mock.calls.find((call) => call[0] === subject);
  }
});
