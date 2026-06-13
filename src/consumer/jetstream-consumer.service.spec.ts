import { Test } from '@nestjs/testing';
import { JetStreamClient, JsMsg, NatsConnection } from 'nats';
import { JetStreamConsumerService, defaultDlqSubjectBuilder } from './jetstream-consumer.service';
import { ConsumerService } from './consumer.service';
import { EventLoggerService, EventLogContext, EventErrorLogContext } from '../logging/event-logger.service';
import { NATS_JETSTREAM_TOKEN, DLQ_SUBJECT_BUILDER_TOKEN, ConsumerModule } from './consumer.module';
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
        { provide: NATS_JETSTREAM_TOKEN, useValue: jetStream },
        { provide: DLQ_SUBJECT_BUILDER_TOKEN, useValue: defaultDlqSubjectBuilder },
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

  describe('handleMessage — successful processing', () => {
    it('should ack the message and log consumption on success', async () => {
      const handler = jest.fn().mockResolvedValue(undefined);
      consumerService.registerHandler(testSubject, handler);

      const msg = createJsMsg(createValidEventJson(), testSubject);
      await (service as any).handleMessage(msg, testSubject);

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

  describe('handleMessage — validation failure', () => {
    it('should route invalid events to DLQ and ack when EventConsumerException is thrown', async () => {
      const handler = jest.fn().mockResolvedValue(undefined);
      consumerService.registerHandler(testSubject, handler);

      const invalidData = { ...createValidEventJson(), id: 'invalid-id' };
      const msg = createJsMsg(invalidData, testSubject);
      await (service as any).handleMessage(msg, testSubject);

      expect(msg.ack).toHaveBeenCalledTimes(1);
      expect(msg.nak).not.toHaveBeenCalled();
      expect(handler).not.toHaveBeenCalled();

      expect(mockLogger.logEventDlq).toHaveBeenCalledTimes(1);
      const dlqContext = mockLogger.logEventDlq.mock.calls[0][0] as EventErrorLogContext;
      expect(dlqContext.error).toContain('Event validation failed');
      expect(dlqContext.subject).toBe(testSubject);

      expect(jetStream.publish).toHaveBeenCalledTimes(1);
      const [dlqSubject] = jetStream.publish.mock.calls[0];
      expect(dlqSubject).toBe(`dlq.${testSubject}`);
    });
  });

  describe('handleMessage — handler throws EventConsumerException', () => {
    it('should route to DLQ when handler throws EventConsumerException', async () => {
      const consumerException = new EventConsumerException({
        message: 'Business rule violation',
        eventId: 'evt_test-123',
        eventType: 'payment.proof.uploaded',
        correlationId: '660e8400-e29b-41d4-a716-446655440001',
      });
      const handler = jest.fn().mockRejectedValue(consumerException);
      consumerService.registerHandler(testSubject, handler);

      const msg = createJsMsg(createValidEventJson(), testSubject);
      await (service as any).handleMessage(msg, testSubject);

      expect(msg.ack).toHaveBeenCalledTimes(1);
      expect(msg.nak).not.toHaveBeenCalled();

      expect(mockLogger.logEventDlq).toHaveBeenCalledTimes(1);
      expect(jetStream.publish).toHaveBeenCalledTimes(1);
    });
  });

  describe('handleMessage — handler throws generic error', () => {
    it('should nack and log error when handler throws non-EventConsumerException', async () => {
      const handler = jest.fn().mockRejectedValue(new Error('Unexpected failure'));
      consumerService.registerHandler(testSubject, handler);

      const msg = createJsMsg(createValidEventJson(), testSubject);
      await (service as any).handleMessage(msg, testSubject);

      expect(msg.nak).toHaveBeenCalledTimes(1);
      expect(msg.ack).not.toHaveBeenCalled();

      expect(mockLogger.logEventError).toHaveBeenCalledTimes(1);
      const errorContext = mockLogger.logEventError.mock.calls[0][0] as EventErrorLogContext;
      expect(errorContext.error).toBe('Unexpected failure');
      expect(errorContext.subject).toBe(testSubject);
    });
  });

  describe('handleMessage — DLQ publish failure', () => {
    it('should nack the original message when DLQ publish fails', async () => {
      jetStream.publish.mockRejectedValue(new Error('DLQ publish failed'));

      const handler = jest.fn().mockResolvedValue(undefined);
      consumerService.registerHandler(testSubject, handler);

      const invalidData = { ...createValidEventJson(), id: 'invalid-id' };
      const msg = createJsMsg(invalidData, testSubject);
      await (service as any).handleMessage(msg, testSubject);

      expect(msg.nak).toHaveBeenCalledTimes(1);
      expect(msg.ack).not.toHaveBeenCalled();
    });
  });

  describe('handleMessage — malformed JSON', () => {
    it('should nack when message payload is not valid JSON', async () => {
      const handler = jest.fn().mockResolvedValue(undefined);
      consumerService.registerHandler(testSubject, handler);

      const malformedPayload = new TextEncoder().encode('not json');
      const msg = createJsMsg(createValidEventJson(), testSubject);
      (msg as unknown as Record<string, unknown>).data = malformedPayload;

      await (service as any).handleMessage(msg, testSubject);

      expect(msg.nak).toHaveBeenCalledTimes(1);
      expect(msg.ack).not.toHaveBeenCalled();
      expect(handler).not.toHaveBeenCalled();
    });

    it('should nack when message payload is an array instead of object', async () => {
      const handler = jest.fn().mockResolvedValue(undefined);
      consumerService.registerHandler(testSubject, handler);

      const arrayPayload = new TextEncoder().encode(JSON.stringify([1, 2, 3]));
      const msg = createJsMsg(createValidEventJson(), testSubject);
      (msg as unknown as Record<string, unknown>).data = arrayPayload;

      await (service as any).handleMessage(msg, testSubject);

      expect(msg.nak).toHaveBeenCalledTimes(1);
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

  describe('ConsumerModule', () => {
    it('should resolve JetStream from connection via forRoot', () => {
      const mockConnection: Partial<NatsConnection> & { jetstream: jest.Mock } = {
        jetstream: jest.fn().mockReturnValue(jetStream),
      };
      const dynamicModule = ConsumerModule.forRoot({
        connection: mockConnection as NatsConnection,
      });
      expect(mockConnection.jetstream).toHaveBeenCalledTimes(1);
      expect(dynamicModule.exports).toContain(ConsumerService);
      expect(dynamicModule.exports).toContain(JetStreamConsumerService);
    });

    it('should use provided jetStream directly via forRoot', () => {
      const dynamicModule = ConsumerModule.forRoot({
        jetStream: jetStream as unknown as JetStreamClient,
      });
      expect(dynamicModule.exports).toContain(ConsumerService);
      expect(dynamicModule.exports).toContain(JetStreamConsumerService);
    });

    it('should throw if neither connection nor jetStream is provided', () => {
      expect(() => ConsumerModule.forRoot({})).toThrow(
        'ConsumerModule requires either connection or jetStream in options',
      );
    });

    it('should resolve JetStream from async factory via forRootAsync', async () => {
      const dynamicModule = ConsumerModule.forRootAsync({
        useFactory: async () => ({ jetStream: jetStream as unknown as JetStreamClient }),
      });

      const jetStreamProvider = dynamicModule.providers?.find(
        (p) => 'provide' in p && p.provide === NATS_JETSTREAM_TOKEN,
      ) as { useFactory: () => Promise<JetStreamClient> };
      const resolved = await jetStreamProvider.useFactory();
      expect(resolved).toBe(jetStream);
    });

    it('should provide custom dlqSubjectBuilder via forRoot', () => {
      const customBuilder = (subject: string) => `custom-dlq.${subject}`;
      const dynamicModule = ConsumerModule.forRoot({
        jetStream: jetStream as unknown as JetStreamClient,
        dlqSubjectBuilder: customBuilder,
      });

      const dlqProvider = dynamicModule.providers?.find(
        (p) => 'provide' in p && p.provide === DLQ_SUBJECT_BUILDER_TOKEN,
      ) as { provide: string; useValue: (subject: string) => string };
      expect(dlqProvider.useValue).toBe(customBuilder);
    });
  });
});
