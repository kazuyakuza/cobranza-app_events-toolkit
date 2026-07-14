import { Test } from '@nestjs/testing';
import { ConsumerOptsBuilder, JsMsg } from 'nats';
import { RequestReplyConsumerService } from './request-reply-consumer.service';
import { REQUEST_REPLY_CONSUMER_DEPS_TOKEN } from './request-reply-consumer-deps.interface';
import { defaultDlqSubjectBuilder } from './subscribe-options.interface';
import { EventConsumerException } from '../common/errors/event-consumer.exception';
import { ActorType } from '../common/envelope/actor-type.enum';
import { EventLoggerService } from '../logging/event-logger.service';
import { RequestReplyMessageProcessor, MessageProcessorDeps } from './request-reply-message-processor';

describe('RequestReplyConsumerService', () => {
  let service: RequestReplyConsumerService;
  let jetStream: { publish: jest.Mock; subscribe: jest.Mock };
  let mockLogger: {
    logEventConsumed: jest.Mock;
    logEventError: jest.Mock;
    logEventDlq: jest.Mock;
    logEventEmitted: jest.Mock;
  };

  beforeEach(async () => {
    jetStream = { publish: jest.fn().mockResolvedValue({}), subscribe: jest.fn() };
    mockLogger = {
      logEventConsumed: jest.fn(),
      logEventError: jest.fn(),
      logEventDlq: jest.fn(),
      logEventEmitted: jest.fn(),
    };

    const module = await Test.createTestingModule({
      providers: [
        {
          provide: REQUEST_REPLY_CONSUMER_DEPS_TOKEN,
          useFactory: (logger: EventLoggerService) => ({
            jetStream,
            logger,
            dlqSubjectBuilder: defaultDlqSubjectBuilder,
            responseSubjectPattern: 'company.*.response.v1',
          }),
          inject: [EventLoggerService],
        },
        { provide: EventLoggerService, useValue: mockLogger },
        RequestReplyConsumerService,
      ],
    }).compile();

    service = module.get(RequestReplyConsumerService);
  });

  describe('registerHandler', () => {
    it('should register a handler by eventType', () => {
      const handler = jest.fn();
      service.registerHandler({ eventType: 'payment.proof.uploaded', handler });
      expect(service.handlerCount).toBe(1);
      expect(service.getHandler('payment.proof.uploaded')).toBe(handler);
    });

    it('should register a handler with eventType + companyId', () => {
      const handler = jest.fn();
      service.registerHandler({
        eventType: 'payment.proof.uploaded',
        handler,
        companyId: 'tenant-1',
      });
      expect(service.handlerCount).toBe(1);
      expect(service.getHandler('payment.proof.uploaded', 'tenant-1')).toBe(handler);
    });

    it('should replace an existing handler for the same key', () => {
      const firstHandler = jest.fn();
      const secondHandler = jest.fn();
      service.registerHandler({ eventType: 'payment.proof.uploaded', handler: firstHandler });
      service.registerHandler({ eventType: 'payment.proof.uploaded', handler: secondHandler });
      expect(service.handlerCount).toBe(1);
      expect(service.getHandler('payment.proof.uploaded')).toBe(secondHandler);
    });
  });

  describe('dispatch', () => {
    it('should invoke handler matched by eventType', async () => {
      const handler = jest.fn().mockResolvedValue(undefined);
      service.registerHandler({ eventType: 'payment.proof.uploaded', handler });

      const event = createTestEvent();
      await service.dispatch({ subject: 'company.response.v1', event, context: createTestContext() });

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(event, createTestContext());
    });

    it('should prefer eventType:companyId handler over eventType-only handler', async () => {
      const genericHandler = jest.fn().mockResolvedValue(undefined);
      const specificHandler = jest.fn().mockResolvedValue(undefined);

      service.registerHandler({ eventType: 'payment.proof.uploaded', handler: genericHandler });
      service.registerHandler({
        eventType: 'payment.proof.uploaded',
        handler: specificHandler,
        companyId: '550e8400-e29b-41d4-a716-446655440000',
      });

      const event = createTestEvent();
      await service.dispatch({ subject: 'company.response.v1', event, context: createTestContext() });

      expect(specificHandler).toHaveBeenCalledTimes(1);
      expect(genericHandler).not.toHaveBeenCalled();
    });

    it('should fall back to eventType-only handler when no company-specific handler exists', async () => {
      const genericHandler = jest.fn().mockResolvedValue(undefined);
      service.registerHandler({ eventType: 'payment.proof.uploaded', handler: genericHandler });

      const event = createTestEvent();
      await service.dispatch({ subject: 'company.response.v1', event, context: createTestContext() });

      expect(genericHandler).toHaveBeenCalledTimes(1);
    });

    it('should throw EventConsumerException when no handler matches', async () => {
      const event = createTestEvent();
      await expect(
        service.dispatch({ subject: 'company.response.v1', event, context: createTestContext() }),
      ).rejects.toThrow(EventConsumerException);
    });

    it('should propagate handler errors', async () => {
      const handlerError = new Error('Handler failed');
      const handler = jest.fn().mockRejectedValue(handlerError);
      service.registerHandler({ eventType: 'payment.proof.uploaded', handler });

      const event = createTestEvent();
      await expect(
        service.dispatch({ subject: 'company.response.v1', event, context: createTestContext() }),
      ).rejects.toThrow('Handler failed');
    });

    it('should throw with event type in message when no handler', async () => {
      const event = createTestEvent();
      await expect(
        service.dispatch({ subject: 'company.response.v1', event, context: createTestContext() }),
      ).rejects.toThrow('payment.proof.uploaded');
    });
  });

  describe('getHandler', () => {
    it('should return undefined for unregistered eventType', () => {
      expect(service.getHandler('unknown.type')).toBeUndefined();
    });
  });

  describe('handlerCount', () => {
    it('should return 0 initially', () => {
      expect(service.handlerCount).toBe(0);
    });

    it('should reflect the number of registered handlers', () => {
      service.registerHandler({ eventType: 'type.a', handler: jest.fn() });
      service.registerHandler({ eventType: 'type.b', handler: jest.fn() });
      expect(service.handlerCount).toBe(2);
    });
  });

  describe('subscribe', () => {
    it('should subscribe with valid consumer options', async () => {
      const asyncIterable = (async function* () {})();
      jetStream.subscribe.mockResolvedValue(asyncIterable);

      await service.subscribe('company.*.response.v1');

      expect(jetStream.subscribe).toHaveBeenCalledTimes(1);
      const [subjectArg, optsArg] = jetStream.subscribe.mock.calls[0];
      expect(subjectArg).toBe('company.*.response.v1');
      expect(typeof (optsArg as ConsumerOptsBuilder).getOpts).toBe('function');
      const resolved = (optsArg as ConsumerOptsBuilder).getOpts();
      expect(resolved.config.ack_policy).toBeDefined();
    });
  });
});

describe('RequestReplyMessageProcessor', () => {
  let jetStream: { publish: jest.Mock };
  let mockLogger: {
    logEventConsumed: jest.Mock;
    logEventError: jest.Mock;
    logEventDlq: jest.Mock;
  };
  let dispatch: jest.Mock;
  let processor: RequestReplyMessageProcessor;

  beforeEach(() => {
    jetStream = { publish: jest.fn().mockResolvedValue({}) };
    mockLogger = {
      logEventConsumed: jest.fn(),
      logEventError: jest.fn(),
      logEventDlq: jest.fn(),
    };
    dispatch = jest.fn().mockResolvedValue(undefined);

    const deps: MessageProcessorDeps = {
      jetStream,
      logger: mockLogger as unknown as EventLoggerService,
      dlqSubjectBuilder: defaultDlqSubjectBuilder,
      dispatch,
    };
    processor = new RequestReplyMessageProcessor(deps);
  });

  function createJsMsg(overrides: Partial<Record<string, unknown>> = {}): JsMsg {
    return {
      data: new TextEncoder().encode(JSON.stringify(createValidEnvelopeData(overrides))),
      subject: 'company.tenant-1.response.v1',
      ack: jest.fn(),
      nak: jest.fn(),
      ...overrides,
    } as unknown as JsMsg;
  }

  it('should ack and log consumed on successful message processing', async () => {
    const msg = createJsMsg();
    await processor.processMessage(msg, 'company.tenant-1.response.v1');

    expect(msg.ack).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(mockLogger.logEventConsumed).toHaveBeenCalledTimes(1);
  });

  it('should nak on invalid JSON payload', async () => {
    const msg = {
      data: new TextEncoder().encode('not json'),
      subject: 'company.tenant-1.response.v1',
      ack: jest.fn(),
      nak: jest.fn(),
    } as unknown as JsMsg;

    await processor.processMessage(msg, 'company.tenant-1.response.v1');

    expect(msg.ack).not.toHaveBeenCalled();
    expect(msg.nak).toHaveBeenCalledTimes(1);
    expect(mockLogger.logEventError).toHaveBeenCalled();
    expect(mockLogger.logEventDlq).not.toHaveBeenCalled();
  });

  it('should nak on non-object JSON payload', async () => {
    const msg = {
      data: new TextEncoder().encode('"just-a-string"'),
      subject: 'company.tenant-1.response.v1',
      ack: jest.fn(),
      nak: jest.fn(),
    } as unknown as JsMsg;

    await processor.processMessage(msg, 'company.tenant-1.response.v1');

    expect(msg.ack).not.toHaveBeenCalled();
    expect(msg.nak).toHaveBeenCalledTimes(1);
    expect(mockLogger.logEventError).toHaveBeenCalled();
  });

  it('should route validation failures to DLQ and ack the original message', async () => {
    const msg = createJsMsg({ id: 'invalid-id' });
    await processor.processMessage(msg, 'company.tenant-1.response.v1');

    expect(mockLogger.logEventDlq).toHaveBeenCalled();
    expect(jetStream.publish).toHaveBeenCalledWith('dlq.company.tenant-1.response.v1', expect.any(Uint8Array));
    expect(msg.ack).toHaveBeenCalledTimes(1);
  });

  it('should nak on unexpected handler error and log error', async () => {
    dispatch.mockRejectedValue(new Error('unexpected error'));
    const msg = createJsMsg();

    await processor.processMessage(msg, 'company.tenant-1.response.v1');

    expect(msg.nak).toHaveBeenCalledTimes(1);
    expect(msg.ack).not.toHaveBeenCalled();
    expect(mockLogger.logEventError).toHaveBeenCalled();
  });

  it('should nak and log error when DLQ publish fails', async () => {
    jetStream.publish.mockRejectedValue(new Error('publish failed'));
    const msg = createJsMsg({ id: 'invalid-id' });

    await processor.processMessage(msg, 'company.tenant-1.response.v1');

    expect(msg.nak).toHaveBeenCalledTimes(1);
    expect(mockLogger.logEventError).toHaveBeenCalled();
  });

  it('should not crash when logEventConsumed throws', async () => {
    mockLogger.logEventConsumed.mockImplementation(() => {
      throw new Error('log error');
    });
    const msg = createJsMsg();

    await expect(processor.processMessage(msg, 'company.tenant-1.response.v1')).resolves.toBeUndefined();

    expect(msg.ack).toHaveBeenCalledTimes(1);
    expect(mockLogger.logEventError).toHaveBeenCalled();
  });

  it('should propagate EventConsumerException from dispatch to DLQ', async () => {
    const consumerError = new EventConsumerException({
      message: 'Handler not found',
      eventId: 'evt_test-123',
      eventType: 'payment.proof.uploaded',
    });
    dispatch.mockRejectedValue(consumerError);
    const msg = createJsMsg();

    await processor.processMessage(msg, 'company.tenant-1.response.v1');

    expect(mockLogger.logEventDlq).toHaveBeenCalled();
    expect(msg.ack).toHaveBeenCalledTimes(1);
  });
});

function createValidEnvelopeData(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id: 'evt_550e8400-e29b-41d4-a716-446655440000',
    type: 'payment.proof.uploaded',
    version: '1.0.0',
    produced_at: '2026-06-14T00:00:00.000Z',
    producer: 'test-service',
    company_id: '550e8400-e29b-41d4-a716-446655440000',
    actor_type: ActorType.CLIENT,
    actor_id: 'user-123',
    correlation_id: '660e8400-e29b-41d4-a716-446655440001',
    data: { amount: 100 },
    ...overrides,
  };
}

function createTestEvent(
  overrides: Partial<Record<string, unknown>> = {},
): import('../common/envelope/event-envelope.class').EventEnvelope<unknown> {
  const { EventEnvelope } = jest.requireActual('../common/envelope/event-envelope.class');
  return new EventEnvelope({
    id: 'evt_test-123',
    type: 'payment.proof.uploaded',
    version: '1.0.0',
    produced_at: '2026-06-13T15:00:00.000Z',
    producer: 'payment-service',
    company_id: '550e8400-e29b-41d4-a716-446655440000',
    actor_type: ActorType.CLIENT,
    actor_id: 'user-123',
    correlation_id: '660e8400-e29b-41d4-a716-446655440001',
    data: { amount: 100 },
    ...overrides,
  });
}

function createTestContext(): import('../common/envelope/event-context.interface').EventContext {
  return {
    type: 'payment.proof.uploaded',
    version: '1.0.0',
    producer: 'payment-service',
    companyId: '550e8400-e29b-41d4-a716-446655440000',
    actorType: ActorType.CLIENT,
    actorId: 'user-123',
    correlationId: '660e8400-e29b-41d4-a716-446655440001',
  };
}
