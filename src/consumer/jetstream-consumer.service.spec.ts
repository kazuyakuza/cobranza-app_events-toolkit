import { Test } from '@nestjs/testing';
import { JsMsg } from 'nats';
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
    it('should register handler and create JetStream subscription', async () => {
      const handler = jest.fn().mockResolvedValue(undefined);
      const asyncIterable = (async function* () {})();
      jetStream.subscribe.mockResolvedValue(asyncIterable);

      await service.subscribe({ subject: testSubject, handler });

      expect(consumerService.getHandler(testSubject)).toBe(handler);
      expect(jetStream.subscribe).toHaveBeenCalledWith(testSubject, {});
    });
  });
});
