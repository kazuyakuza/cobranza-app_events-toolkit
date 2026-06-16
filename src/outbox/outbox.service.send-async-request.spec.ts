import { OutboxService } from './outbox.service';
import { ActorType } from '../common/envelope/actor-type.enum';
import { createOutboxMocks, createService, resetMocks } from './outbox.service.fixture';
import { SendAsyncRequestThroughOutboxOptions } from './send-async-request-through-outbox-options.interface';
import { AsyncRequestEventContext } from './async-request-event-context.interface';

function buildValidOptions<T>(
  payload: T,
  overrides?: Partial<SendAsyncRequestThroughOutboxOptions<T>>,
): SendAsyncRequestThroughOutboxOptions<T> {
  return {
    subject: 'company.550e8400e29b41d4a716446655440000.credit.check.requested.v1',
    payload,
    context: {
      type: 'credit.check.requested',
      version: '1.0.0',
      producer: 'debt-service',
      companyId: '550e8400-e29b-41d4-a716-446655440000',
      actorType: ActorType.SYSTEM,
      actorId: 'debt-service',
      correlationId: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
      replyTo: 'company.550e8400e29b41d4a716446655440000.credit.check.completed.v1',
    },
    ...overrides,
  };
}

describe('OutboxService — sendAsyncRequestThroughOutbox', () => {
  let mocks: ReturnType<typeof createOutboxMocks>;
  let service: OutboxService;

  beforeEach(() => {
    mocks = createOutboxMocks();
    service = createService(mocks);
    resetMocks(mocks);
  });

  it('builds envelope from payload and context, saves to outbox, and returns correlationId', async () => {
    const options = buildValidOptions({ clientId: 'client-123' });

    const result = await service.sendAsyncRequestThroughOutbox(options);

    expect(mocks.repository.save).toHaveBeenCalledTimes(1);
    const saveArg = mocks.repository.save.mock.calls[0][0];
    expect(saveArg.event).toBeDefined();
    expect(saveArg.event.data).toEqual({ clientId: 'client-123' });
    expect(saveArg.event.reply_to).toBe(options.context.replyTo);
    expect(result.correlationId).toBe(options.context.correlationId);
  });

  it('sets reply_to on the envelope from context.replyTo', async () => {
    const replySubject = 'company.550e8400...credit.check.completed.v1';
    const options = buildValidOptions(
      { clientId: 'client-123' },
      { context: { ...buildValidOptions({}).context, replyTo: replySubject } },
    );

    await service.sendAsyncRequestThroughOutbox(options);

    const saveArg = mocks.repository.save.mock.calls[0][0];
    expect(saveArg.event.reply_to).toBe(replySubject);
  });

  it('returns the correct correlationId from the built envelope', async () => {
    const correlationId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
    const options = buildValidOptions(
      { clientId: 'client-123' },
      { context: { ...buildValidOptions({}).context, correlationId } },
    );

    const result = await service.sendAsyncRequestThroughOutbox(options);

    expect(result.correlationId).toBe(correlationId);
  });

  it('passes the correct subject to saveToOutbox', async () => {
    const subject = 'company.550e8400...credit.check.requested.v1';
    const options = buildValidOptions({ clientId: 'client-123' }, { subject });

    await service.sendAsyncRequestThroughOutbox(options);

    const saveArg = mocks.repository.save.mock.calls[0][0];
    expect(saveArg.subject).toBe(subject);
  });

  it('populates all EventEnvelope fields from the context', async () => {
    const context: AsyncRequestEventContext = {
      type: 'credit.check.requested',
      version: '1.0.0',
      producer: 'debt-service',
      companyId: '550e8400-e29b-41d4-a716-446655440000',
      actorType: ActorType.SYSTEM,
      actorId: 'debt-service',
      correlationId: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
      replyTo: 'company.550e8400...credit.check.completed.v1',
    };

    const options: SendAsyncRequestThroughOutboxOptions<{ clientId: string }> = {
      subject: 'company.550e8400...credit.check.requested.v1',
      payload: { clientId: 'client-123' },
      context,
    };

    await service.sendAsyncRequestThroughOutbox(options);

    const saveArg = mocks.repository.save.mock.calls[0][0];
    const event = saveArg.event;

    expect(event.id).toBeDefined();
    expect(event.id).toMatch(/^evt_/);
    expect(event.type).toBe(context.type);
    expect(event.version).toBe(context.version);
    expect(event.producer).toBe(context.producer);
    expect(event.company_id).toBe(context.companyId);
    expect(event.actor_type).toBe(context.actorType);
    expect(event.actor_id).toBe(context.actorId);
    expect(event.correlation_id).toBe(context.correlationId);
    expect(event.causation_id).toBeUndefined();
    expect(event.trace_id).toBeUndefined();
    expect(event.reply_to).toBe(context.replyTo);
    expect(event.data).toEqual({ clientId: 'client-123' });
    expect(event.produced_at).toBeDefined();
    expect(typeof event.produced_at).toBe('string');
  });

  it('works with different payload types', async () => {
    const payload = { amount: 100, currency: 'USD' };
    const options = buildValidOptions(payload);

    await service.sendAsyncRequestThroughOutbox(options);

    const saveArg = mocks.repository.save.mock.calls[0][0];
    expect(saveArg.event.data).toEqual(payload);
  });
});
