import { ActorType } from '../common/envelope/actor-type.enum';
import { EventEnvelope } from '../common/envelope/event-envelope.class';
import { MockRequestReplyService } from './mock-request-reply.service';

function createTestEnvelope(replyTo?: string): EventEnvelope<unknown> {
  return new EventEnvelope({
    id: 'evt_test-id-001',
    type: 'test.request',
    version: '1.0.0',
    produced_at: '2026-06-16T12:00:00.000Z',
    producer: 'test-service',
    company_id: '550e8400-e29b-41d4-a716-446655440000',
    actor_type: ActorType.SYSTEM,
    actor_id: 'test-actor',
    correlation_id: '660e8400-e29b-41d4-a716-446655440001',
    reply_to: replyTo,
    data: { value: 100 },
  });
}

describe('MockRequestReplyService', () => {
  let service: MockRequestReplyService;

  beforeEach(() => {
    service = new MockRequestReplyService();
  });

  it('request records call and returns mock response', async () => {
    const result = await service.request(
      'test.subject',
      { value: 100 },
      {
        timeoutMs: 5000,
        context: {
          type: 'test.request',
          version: '1.0.0',
          producer: 'test-service',
          companyId: '550e8400-e29b-41d4-a716-446655440000',
          actorType: ActorType.SYSTEM,
          actorId: 'test-actor',
          correlationId: '660e8400-e29b-41d4-a716-446655440001',
        },
      },
    );

    expect(result).toEqual({ data: {}, raw: new Uint8Array(0) });
    const requests = service.getRequests();
    expect(requests).toHaveLength(1);
    expect(requests[0].subject).toBe('test.subject');
    expect(requests[0].payload).toEqual({ value: 100 });
  });

  it('setMockResponse overrides default response', async () => {
    service.setMockResponse({ data: { status: 'ok' }, raw: new Uint8Array([1, 2, 3]) });

    const result = await service.request(
      'test.subject',
      {},
      {
        context: {
          type: 'test.request',
          version: '1.0.0',
          producer: 'test-service',
          companyId: '550e8400-e29b-41d4-a716-446655440000',
          actorType: ActorType.SYSTEM,
          actorId: 'test-actor',
          correlationId: '660e8400-e29b-41d4-a716-446655440001',
        },
      },
    );

    expect(result.data).toEqual({ status: 'ok' });
  });

  it('sendResponse records call', async () => {
    const envelope = createTestEnvelope();
    await service.sendResponse('corr-001', envelope);

    const calls = service.getSendResponseCalls();
    expect(calls).toHaveLength(1);
    expect(calls[0].correlationId).toBe('corr-001');
    expect(calls[0].event).toBe(envelope);
  });

  it('sendRequest records call and returns mock result', async () => {
    const result = await service.sendRequest({
      subject: 'test.subject',
      payload: { value: 100 },
      context: {
        type: 'test.request',
        version: '1.0.0',
        producer: 'test-service',
        companyId: '550e8400-e29b-41d4-a716-446655440000',
        actorType: ActorType.SYSTEM,
        actorId: 'test-actor',
        correlationId: '660e8400-e29b-41d4-a716-446655440001',
        replyTo: 'reply.subject',
      },
    });

    expect(result).toEqual({ correlationId: 'mock-correlation-id' });
    const calls = service.getSendRequestCalls();
    expect(calls).toHaveLength(1);
    expect(calls[0].subject).toBe('test.subject');
  });

  it('isRequestReplyMessage returns true when reply_to is set', () => {
    const withReply = createTestEnvelope('reply.subject');
    expect(service.isRequestReplyMessage(withReply)).toBe(true);
  });

  it('isRequestReplyMessage returns false when reply_to is not set', () => {
    const withoutReply = createTestEnvelope();
    expect(service.isRequestReplyMessage(withoutReply)).toBe(false);
  });

  it('buildResponseEnvelope preserves correlation_id and causation_id', () => {
    const requestEvent = createTestEnvelope();
    const responseEnvelope = service.buildResponseEnvelope({
      requestEvent,
      responseContext: {
        type: 'test.response',
        version: '1.0.0',
        producer: 'test-service',
        companyId: '550e8400-e29b-41d4-a716-446655440000',
        actorType: ActorType.SYSTEM,
        actorId: 'test-actor',
        correlationId: 'ignored',
        causationId: 'ignored',
      },
      responseData: { result: 'ok' },
    });

    expect(responseEnvelope.correlation_id).toBe('660e8400-e29b-41d4-a716-446655440001');
    expect(responseEnvelope.causation_id).toBe('evt_test-id-001');
    expect(responseEnvelope.data).toEqual({ result: 'ok' });
  });

  it('clear resets all recorded calls and mock response', async () => {
    await service.request(
      'subject.a',
      {},
      {
        context: {
          type: 'test.request',
          version: '1.0.0',
          producer: 'test-service',
          companyId: '550e8400-e29b-41d4-a716-446655440000',
          actorType: ActorType.SYSTEM,
          actorId: 'test-actor',
          correlationId: '660e8400-e29b-41d4-a716-446655440001',
        },
      },
    );
    await service.sendResponse('corr-001', createTestEnvelope());
    service.setMockResponse({ data: { custom: true }, raw: new Uint8Array([1]) });

    service.clear();

    expect(service.getRequests()).toHaveLength(0);
    expect(service.getSendResponseCalls()).toHaveLength(0);
    expect(service.getSendRequestCalls()).toHaveLength(0);

    const result = await service.request(
      'new.subject',
      {},
      {
        context: {
          type: 'test.request',
          version: '1.0.0',
          producer: 'test-service',
          companyId: '550e8400-e29b-41d4-a716-446655440000',
          actorType: ActorType.SYSTEM,
          actorId: 'test-actor',
          correlationId: '660e8400-e29b-41d4-a716-446655440001',
        },
      },
    );
    expect(result).toEqual({ data: {}, raw: new Uint8Array(0) });
  });
});
