import { Test } from '@nestjs/testing';
import { AckPolicy, consumerOpts, ConsumerOpts, ConsumerOptsBuilder, JsMsg } from 'nats';
import { JetStreamConsumerService } from './jetstream-consumer.service';
import { defaultDlqSubjectBuilder } from './subscribe-options.interface';
import { ConsumerService } from './consumer.service';
import { EventLoggerService, EventLogContext, EventErrorLogContext } from '../logging/event-logger.service';
import { JETSTREAM_CONSUMER_DEPS_TOKEN } from './jetstream-consumer-deps.interface';
import { EventConsumerException } from '../common/errors/event-consumer.exception';
import { ActorType } from '../common/envelope/actor-type.enum';

function createValidEventJson(): Record<string, unknown> {
  return {
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
  };
}

function createJsMsg(data: Record<string, unknown>, subject: string): JsMsg {
  const payload = new TextEncoder().encode(JSON.stringify(data));
  return {
    seq: 1,
    subject,
    data: payload,
    redelivered: false,
    headers: undefined,
    ack: jest.fn(),
    nak: jest.fn(),
    term: jest.fn(),
    working: jest.fn(),
    ackAck: jest.fn().mockResolvedValue(true),
    next: jest.fn(),
    sid: 1,
    info: {} as never,
    json: jest.fn().mockReturnValue(data),
    string: jest.fn().mockReturnValue(JSON.stringify(data)),
  } as unknown as JsMsg;
}

describe('JetStreamConsumerService', () => {
  let service: JetStreamConsumerService;
  let jetStream: { publish: jest.Mock; subscribe: jest.Mock };
  let consumerService: ConsumerService;
  let mockLogger: {
    logEventConsumed: jest.Mock;
    logEventError: jest.Mock;
    logEventDlq: jest.Mock;
    logEventEmitted: jest.Mock;
  };

  const testSubject = 'company.550e8400.payment.proof.uploaded.v1';

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
          provide: JETSTREAM_CONSUMER_DEPS_TOKEN,
          useFactory: (cs: ConsumerService, logger: EventLoggerService) => ({
            jetStream,
            consumerService: cs,
            logger,
            dlqSubjectBuilder: defaultDlqSubjectBuilder,
          }),
          inject: [ConsumerService, EventLoggerService],
        },
        { provide: EventLoggerService, useValue: mockLogger },
        ConsumerService,
        JetStreamConsumerService,
      ],
    }).compile();

    service = module.get(JetStreamConsumerService);
    consumerService = module.get(ConsumerService);
  });

  describe('defaultDlqSubjectBuilder', () => {
    it('should prepend dlq. to the subject', () => {
      expect(defaultDlqSubjectBuilder('company.abc.payment.proof.uploaded.v1')).toBe(
        'dlq.company.abc.payment.proof.uploaded.v1',
      );
    });
  });

  describe('processMessage — successful processing', () => {
    it('should ack the message and log consumption on success', async () => {
      const handler = jest.fn().mockResolvedValue(undefined);
      consumerService.registerHandler(testSubject, handler);

      const msg = createJsMsg(createValidEventJson(), testSubject);
      await service.processMessage(msg, testSubject);

      expect(msg.ack).toHaveBeenCalledTimes(1);
      expect(msg.nak).not.toHaveBeenCalled();
      expect(handler).toHaveBeenCalledTimes(1);

      expect(mockLogger.logEventConsumed).toHaveBeenCalledTimes(1);
      const loggedContext = mockLogger.logEventConsumed.mock.calls[0][0] as EventLogContext;
      expect(loggedContext.eventId).toBe('evt_test-123');
      expect(loggedContext.eventType).toBe('payment.proof.uploaded');
      expect(loggedContext.subject).toBe(testSubject);
    });
  });

  describe('processMessage — validation failure', () => {
    it('should route invalid events to DLQ with structured payload and ack', async () => {
      const handler = jest.fn().mockResolvedValue(undefined);
      consumerService.registerHandler(testSubject, handler);

      const invalidData = { ...createValidEventJson(), id: 'invalid-id' };
      const msg = createJsMsg(invalidData, testSubject);
      await service.processMessage(msg, testSubject);

      expect(msg.ack).toHaveBeenCalledTimes(1);
      expect(msg.nak).not.toHaveBeenCalled();
      expect(handler).not.toHaveBeenCalled();

      expect(mockLogger.logEventDlq).toHaveBeenCalledTimes(1);
      const dlqContext = mockLogger.logEventDlq.mock.calls[0][0] as EventErrorLogContext;
      expect(dlqContext.error).toContain('Event validation failed');
      expect(dlqContext.subject).toBe(testSubject);

      expect(jetStream.publish).toHaveBeenCalledTimes(1);
      const [dlqSubject, dlqPayloadBytes] = jetStream.publish.mock.calls[0];
      expect(dlqSubject).toBe(`dlq.${testSubject}`);
      const dlqPayload = JSON.parse(new TextDecoder().decode(dlqPayloadBytes));
      expect(dlqPayload.originalSubject).toBe(testSubject);
      expect(dlqPayload.originalPayload).toEqual(invalidData);
      expect(dlqPayload.error.name).toBe('EventConsumerException');
      expect(dlqPayload.error.eventId).toBe('invalid-id');
      expect(dlqPayload.failedAt).toBeDefined();
    });
  });

  describe('processMessage — handler throws EventConsumerException', () => {
    it('should route to DLQ with structured payload when handler throws EventConsumerException', async () => {
      const consumerException = new EventConsumerException({
        message: 'Business rule violation',
        eventId: 'evt_test-123',
        eventType: 'payment.proof.uploaded',
        correlationId: '660e8400-e29b-41d4-a716-446655440001',
      });
      const handler = jest.fn().mockRejectedValue(consumerException);
      consumerService.registerHandler(testSubject, handler);

      const validData = createValidEventJson();
      const msg = createJsMsg(validData, testSubject);
      await service.processMessage(msg, testSubject);

      expect(msg.ack).toHaveBeenCalledTimes(1);
      expect(msg.nak).not.toHaveBeenCalled();

      expect(mockLogger.logEventDlq).toHaveBeenCalledTimes(1);
      expect(jetStream.publish).toHaveBeenCalledTimes(1);
      const [, dlqPayloadBytes] = jetStream.publish.mock.calls[0];
      const dlqPayload = JSON.parse(new TextDecoder().decode(dlqPayloadBytes));
      expect(dlqPayload.originalPayload).toEqual(validData);
      expect(dlqPayload.error.message).toBe('Business rule violation');
    });

    it('should include dlqReason and retryCount in DLQ payload when provided on EventConsumerException', async () => {
      const consumerException = new EventConsumerException({
        message: 'Business rule violation',
        eventId: 'evt_test-123',
        eventType: 'payment.proof.uploaded',
        correlationId: '660e8400-e29b-41d4-a716-446655440001',
        dlqReason: 'Invalid payment amount',
        originalSubject: 'company.550e8400.payment.proof.uploaded.v1',
        retryCount: 3,
      });
      const handler = jest.fn().mockRejectedValue(consumerException);
      consumerService.registerHandler(testSubject, handler);

      const validData = createValidEventJson();
      const msg = createJsMsg(validData, testSubject);
      await service.processMessage(msg, testSubject);

      expect(jetStream.publish).toHaveBeenCalledTimes(1);
      const [, dlqPayloadBytes] = jetStream.publish.mock.calls[0];
      const dlqPayload = JSON.parse(new TextDecoder().decode(dlqPayloadBytes));
      expect(dlqPayload.error.dlqReason).toBe('Invalid payment amount');
      expect(dlqPayload.error.retryCount).toBe(3);
      expect(dlqPayload.originalSubject).toBe('company.550e8400.payment.proof.uploaded.v1');
    });

    it('should use consumer subject as originalSubject when exception does not provide one', async () => {
      const consumerException = new EventConsumerException({
        message: 'Business rule violation',
        eventId: 'evt_test-456',
        eventType: 'payment.proof.uploaded',
      });
      const handler = jest.fn().mockRejectedValue(consumerException);
      consumerService.registerHandler(testSubject, handler);

      const msg = createJsMsg(createValidEventJson(), testSubject);
      await service.processMessage(msg, testSubject);

      const [, dlqPayloadBytes] = jetStream.publish.mock.calls[0];
      const dlqPayload = JSON.parse(new TextDecoder().decode(dlqPayloadBytes));
      expect(dlqPayload.originalSubject).toBe(testSubject);
      expect(dlqPayload.error.dlqReason).toBeUndefined();
      expect(dlqPayload.error.retryCount).toBeUndefined();
    });
  });

  describe('processMessage — handler throws generic error', () => {
    it('should nack and log error when handler throws non-EventConsumerException', async () => {
      const handler = jest.fn().mockRejectedValue(new Error('Unexpected failure'));
      consumerService.registerHandler(testSubject, handler);

      const msg = createJsMsg(createValidEventJson(), testSubject);
      await service.processMessage(msg, testSubject);

      expect(msg.nak).toHaveBeenCalledTimes(1);
      expect(msg.ack).not.toHaveBeenCalled();

      expect(mockLogger.logEventError).toHaveBeenCalledTimes(1);
      const errorContext = mockLogger.logEventError.mock.calls[0][0] as EventErrorLogContext;
      expect(errorContext.error).toBe('Unexpected failure');
      expect(errorContext.subject).toBe(testSubject);
    });

    it('should nack and log error when handler rejects with a non-Error value', async () => {
      const handler = jest.fn().mockRejectedValue('Unexpected failure');
      consumerService.registerHandler(testSubject, handler);

      const msg = createJsMsg(createValidEventJson(), testSubject);
      await service.processMessage(msg, testSubject);

      expect(msg.nak).toHaveBeenCalledTimes(1);
      expect(msg.ack).not.toHaveBeenCalled();

      expect(mockLogger.logEventError).toHaveBeenCalledTimes(1);
      const errorContext = mockLogger.logEventError.mock.calls[0][0] as EventErrorLogContext;
      expect(errorContext.error).toBe('Unexpected failure');
      expect(errorContext.subject).toBe(testSubject);
    });
  });

  describe('processMessage — DLQ publish failure', () => {
    it('should nack and log error when DLQ publish fails', async () => {
      jetStream.publish.mockRejectedValue(new Error('DLQ publish failed'));

      const handler = jest.fn().mockResolvedValue(undefined);
      consumerService.registerHandler(testSubject, handler);

      const invalidData = { ...createValidEventJson(), id: 'invalid-id' };
      const msg = createJsMsg(invalidData, testSubject);
      await service.processMessage(msg, testSubject);

      expect(msg.nak).toHaveBeenCalledTimes(1);
      expect(msg.ack).not.toHaveBeenCalled();
      expect(mockLogger.logEventError).toHaveBeenCalledTimes(1);
    });
  });

  describe('processMessage — malformed JSON', () => {
    it('should route malformed JSON to DLQ via EventConsumerException', async () => {
      const handler = jest.fn().mockResolvedValue(undefined);
      consumerService.registerHandler(testSubject, handler);

      const malformedPayload = new TextEncoder().encode('not json');
      const msg = createJsMsg(createValidEventJson(), testSubject);
      (msg as unknown as Record<string, unknown>).data = malformedPayload;

      await service.processMessage(msg, testSubject);

      expect(msg.ack).toHaveBeenCalledTimes(1);
      expect(msg.nak).not.toHaveBeenCalled();
      expect(handler).not.toHaveBeenCalled();
      expect(mockLogger.logEventDlq).toHaveBeenCalledTimes(1);
    });

    it('should route non-object payload to DLQ via EventConsumerException', async () => {
      const handler = jest.fn().mockResolvedValue(undefined);
      consumerService.registerHandler(testSubject, handler);

      const arrayPayload = new TextEncoder().encode(JSON.stringify([1, 2, 3]));
      const msg = createJsMsg(createValidEventJson(), testSubject);
      (msg as unknown as Record<string, unknown>).data = arrayPayload;

      await service.processMessage(msg, testSubject);

      expect(msg.ack).toHaveBeenCalledTimes(1);
      expect(msg.nak).not.toHaveBeenCalled();
      expect(mockLogger.logEventDlq).toHaveBeenCalledTimes(1);
    });
  });

  describe('subscribe', () => {
    it('should register handler and create JetStream subscription with default consumer opts', async () => {
      const handler = jest.fn().mockResolvedValue(undefined);
      const asyncIterable = (async function* () {})();
      jetStream.subscribe.mockResolvedValue(asyncIterable);

      await service.subscribe({ subject: testSubject, handler });

      expect(consumerService.getHandler(testSubject)).toBe(handler);
      expect(jetStream.subscribe).toHaveBeenCalledTimes(1);
      const [subjectArg, optsArg] = jetStream.subscribe.mock.calls[0];
      expect(subjectArg).toBe(testSubject);
      expect(typeof (optsArg as ConsumerOptsBuilder).getOpts).toBe('function');
      const resolved = (optsArg as ConsumerOptsBuilder).getOpts();
      expect(resolved.config.ack_policy).toBe(AckPolicy.Explicit);
      expect(resolved.mack).toBe(true);
    });

    it('should pass a caller-provided ConsumerOptsBuilder through unchanged', async () => {
      const handler = jest.fn().mockResolvedValue(undefined);
      const asyncIterable = (async function* () {})();
      jetStream.subscribe.mockResolvedValue(asyncIterable);
      const builder = consumerOpts().durable('my-durable').deliverTo('company.deliver.subject').ackExplicit();

      await service.subscribe({ subject: testSubject, handler, consumerOpts: builder });

      expect(jetStream.subscribe).toHaveBeenCalledWith(testSubject, builder);
    });

    it('should default ack_policy to Explicit for a plain empty consumerOpts object', async () => {
      const handler = jest.fn().mockResolvedValue(undefined);
      const asyncIterable = (async function* () {})();
      jetStream.subscribe.mockResolvedValue(asyncIterable);

      await service.subscribe({
        subject: testSubject,
        handler,
        consumerOpts: {} as Partial<ConsumerOpts>,
      });

      const [, optsArg] = jetStream.subscribe.mock.calls[0] as [string, Partial<ConsumerOpts>];
      expect(optsArg.config?.ack_policy).toBe(AckPolicy.Explicit);
    });

    it('should preserve caller config but default ack_policy when missing in a plain consumerOpts object', async () => {
      const handler = jest.fn().mockResolvedValue(undefined);
      const asyncIterable = (async function* () {})();
      jetStream.subscribe.mockResolvedValue(asyncIterable);

      await service.subscribe({
        subject: testSubject,
        handler,
        consumerOpts: { config: { durable_name: 'd' } },
      });

      const [, optsArg] = jetStream.subscribe.mock.calls[0] as [string, Partial<ConsumerOpts>];
      expect(optsArg.config?.ack_policy).toBe(AckPolicy.Explicit);
      expect(optsArg.config?.durable_name).toBe('d');
    });

    it('should preserve a caller-supplied ack_policy in a plain consumerOpts object', async () => {
      const handler = jest.fn().mockResolvedValue(undefined);
      const asyncIterable = (async function* () {})();
      jetStream.subscribe.mockResolvedValue(asyncIterable);

      await service.subscribe({
        subject: testSubject,
        handler,
        consumerOpts: { config: { ack_policy: AckPolicy.All } },
      });

      const [, optsArg] = jetStream.subscribe.mock.calls[0] as [string, Partial<ConsumerOpts>];
      expect(optsArg.config?.ack_policy).toBe(AckPolicy.All);
    });
  });

  describe('moveToDlq', () => {
    it('should publish to DLQ subject and ack the message', async () => {
      const msg = createJsMsg(createValidEventJson(), testSubject);

      await service.moveToDlq({
        message: msg,
        reason: 'Manual DLQ routing',
      });

      expect(jetStream.publish).toHaveBeenCalledTimes(1);
      const [dlqSubject, dlqPayloadBytes] = jetStream.publish.mock.calls[0];
      expect(dlqSubject).toBe(`dlq.${testSubject}`);
      const dlqPayload = JSON.parse(new TextDecoder().decode(dlqPayloadBytes));
      expect(dlqPayload.originalSubject).toBe(testSubject);
      expect(dlqPayload.error.message).toBe('Manual DLQ routing');
      expect(dlqPayload.error.name).toBe('ManualDLQRouting');
      expect(dlqPayload.failedAt).toBeDefined();

      expect(msg.ack).toHaveBeenCalledTimes(1);
      expect(msg.nak).not.toHaveBeenCalled();
    });

    it('should use custom subject when provided', async () => {
      const customSubject = 'company.550e8400.custom.entity.action.v1';
      const msg = createJsMsg(createValidEventJson(), testSubject);

      await service.moveToDlq({
        message: msg,
        reason: 'Custom subject route',
        subject: customSubject,
      });

      const [dlqSubject] = jetStream.publish.mock.calls[0];
      expect(dlqSubject).toBe(`dlq.${customSubject}`);
    });

    it('should include originalPayload when provided', async () => {
      const msg = createJsMsg(createValidEventJson(), testSubject);
      const payload = { custom: 'data' };

      await service.moveToDlq({
        message: msg,
        reason: 'With payload',
        originalPayload: payload,
      });

      const [, dlqPayloadBytes] = jetStream.publish.mock.calls[0];
      const dlqPayload = JSON.parse(new TextDecoder().decode(dlqPayloadBytes));
      expect(dlqPayload.originalPayload).toEqual(payload);
    });

    it('should nack and log error when DLQ publish fails', async () => {
      jetStream.publish.mockRejectedValue(new Error('DLQ publish failed'));
      const msg = createJsMsg(createValidEventJson(), testSubject);

      await service.moveToDlq({
        message: msg,
        reason: 'Failed publish',
      });

      expect(msg.nak).toHaveBeenCalledTimes(1);
      expect(msg.ack).not.toHaveBeenCalled();
      expect(mockLogger.logEventError).toHaveBeenCalledTimes(1);
    });
  });
});
