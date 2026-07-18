import { Test } from '@nestjs/testing';
import { validateSync } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { GlobalEventEnvelope } from '../common/envelope/global-event-envelope.class';
import { EventEnvelope } from '../common/envelope/event-envelope.class';
import { ActorType } from '../common/envelope/actor-type.enum';
import { JetStreamConsumerService } from './jetstream-consumer.service';
import { defaultDlqSubjectBuilder } from './subscribe-options.interface';
import { ConsumerService } from './consumer.service';
import { EventLoggerService, EventLogContext, EventErrorLogContext } from '../logging/event-logger.service';
import { JETSTREAM_CONSUMER_DEPS_TOKEN } from './jetstream-consumer-deps.interface';
import { createJsMsg } from './jetstream-consumer.service.spec-helpers';

function createValidGlobalEventJson(): Record<string, unknown> {
  return {
    id: 'evt_global-001',
    type: 'iam.company.created',
    version: '1.0.0',
    produced_at: '2026-06-13T15:00:00.000Z',
    producer: 'iam-service',
    actor_type: ActorType.SYSTEM,
    correlation_id: '770e8400-e29b-41d4-a716-446655440002',
    data: { name: 'Acme Corp' },
  };
}

const globalSubject = 'global.iam.company.created.v1';

describe('JetStreamConsumer global event routing', () => {
  let service: JetStreamConsumerService;
  let consumerService: ConsumerService;
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

  describe('processMessage with global subject', () => {
    it('acks and dispatches a valid global event with GlobalEventEnvelope', async () => {
      const handler = jest.fn().mockResolvedValue(undefined);
      consumerService.registerHandler(globalSubject, handler);

      const msg = createJsMsg(createValidGlobalEventJson(), globalSubject);
      await service.processMessage(msg, globalSubject);

      expect(msg.ack).toHaveBeenCalledTimes(1);
      expect(msg.nak).not.toHaveBeenCalled();
      expect(handler).toHaveBeenCalledTimes(1);

      expect(mockLogger.logEventConsumed).toHaveBeenCalledTimes(1);
      const loggedContext = mockLogger.logEventConsumed.mock.calls[0][0] as EventLogContext;
      expect(loggedContext.eventId).toBe('evt_global-001');
      expect(loggedContext.eventType).toBe('iam.company.created');
      expect(loggedContext.subject).toBe(globalSubject);
    });

    it('routes an invalid global message (missing correlation_id) to dlq.global.* and acks', async () => {
      const handler = jest.fn().mockResolvedValue(undefined);
      consumerService.registerHandler(globalSubject, handler);

      const invalidData = { ...createValidGlobalEventJson(), correlation_id: undefined };
      const msg = createJsMsg(invalidData, globalSubject);
      await service.processMessage(msg, globalSubject);

      expect(msg.ack).toHaveBeenCalledTimes(1);
      expect(msg.nak).not.toHaveBeenCalled();
      expect(handler).not.toHaveBeenCalled();

      expect(mockLogger.logEventDlq).toHaveBeenCalledTimes(1);
      const dlqContext = mockLogger.logEventDlq.mock.calls[0][0] as EventErrorLogContext;
      expect(dlqContext.error).toContain('Event validation failed');

      expect(jetStream.publish).toHaveBeenCalledTimes(1);
      const [dlqSubject] = jetStream.publish.mock.calls[0];
      expect(dlqSubject).toBe(`dlq.${globalSubject}`);
    });

    it('routes an invalid global message to dlq with structured payload', async () => {
      const handler = jest.fn().mockResolvedValue(undefined);
      consumerService.registerHandler(globalSubject, handler);

      const invalidData = { ...createValidGlobalEventJson(), id: 'bad-id' };
      const msg = createJsMsg(invalidData, globalSubject);
      await service.processMessage(msg, globalSubject);

      expect(msg.ack).toHaveBeenCalledTimes(1);
      expect(jetStream.publish).toHaveBeenCalledTimes(1);
      const [, dlqPayloadBytes] = jetStream.publish.mock.calls[0];
      const dlqPayload = JSON.parse(new TextDecoder().decode(dlqPayloadBytes));
      expect(dlqPayload.originalSubject).toBe(globalSubject);
      expect(dlqPayload.originalPayload).toEqual(invalidData);
      expect(dlqPayload.error.name).toBe('EventConsumerException');
      expect(dlqPayload.error.eventId).toBe('bad-id');
      expect(dlqPayload.failedAt).toBeDefined();
    });
  });

  describe('GlobalEventEnvelope on global subjects', () => {
    it('validates a properly formed GlobalEventEnvelope without company_id', () => {
      const envelope = plainToInstance(GlobalEventEnvelope, {
        id: 'evt_01929390-7abc-7123-8def-0123456789ab',
        type: 'iam.company.created',
        version: '1.0.0',
        produced_at: '2026-01-15T10:30:00.000Z',
        producer: 'iam-service',
        actor_type: ActorType.SYSTEM,
        correlation_id: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
        data: { name: 'Acme Corp' },
      });
      const errors = validateSync(envelope);
      expect(errors).toHaveLength(0);
    });

    it('rejects a GlobalEventEnvelope missing correlation_id', () => {
      const envelope = plainToInstance(GlobalEventEnvelope, {
        id: 'evt_01929390-7abc-7123-8def-0123456789ab',
        type: 'iam.company.created',
        version: '1.0.0',
        produced_at: '2026-01-15T10:30:00.000Z',
        producer: 'iam-service',
        actor_type: ActorType.SYSTEM,
        data: { name: 'Acme Corp' },
      });
      const errors = validateSync(envelope);
      expect(errors.some((e) => e.property === 'correlation_id')).toBe(true);
    });

    it('tolerates extra company_id on a GlobalEventEnvelope (whitelist mode disabled)', () => {
      const envelope = plainToInstance(GlobalEventEnvelope, {
        id: 'evt_01929390-7abc-7123-8def-0123456789ab',
        type: 'iam.company.created',
        version: '1.0.0',
        produced_at: '2026-01-15T10:30:00.000Z',
        producer: 'iam-service',
        actor_type: ActorType.SYSTEM,
        correlation_id: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
        data: { name: 'Acme Corp' },
        company_id: '550e8400-e29b-41d4-a716-446655440000',
      });
      const errors = validateSync(envelope);
      expect(errors).toHaveLength(0);
    });
  });

  describe('EnvelopeValidationUtil routing', () => {
    it('pickEnvelopeClass returns GlobalEventEnvelope for global subjects', () => {
      const cls = globalSubject.startsWith('global.') ? GlobalEventEnvelope : EventEnvelope;
      const envelope = plainToInstance(cls, {
        id: 'evt_test',
        type: 'iam.company.created',
        version: '1',
        produced_at: '2026-01-15T10:30:00.000Z',
        producer: 'test',
        actor_type: ActorType.SYSTEM,
        correlation_id: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
        data: {},
      });
      expect(envelope).toBeInstanceOf(GlobalEventEnvelope);
    });

    it('pickEnvelopeClass returns EventEnvelope for tenant subjects', () => {
      const tenantSubject = 'company.abc123.payment.proof.uploaded.v1';
      const cls = tenantSubject.startsWith('global.') ? GlobalEventEnvelope : EventEnvelope;
      const envelope = plainToInstance(cls, {
        id: 'evt_test',
        type: 'payment.proof.uploaded',
        version: '1',
        produced_at: '2026-01-15T10:30:00.000Z',
        producer: 'test',
        company_id: '550e8400-e29b-41d4-a716-446655440000',
        actor_type: ActorType.CLIENT,
        actor_id: 'user-1',
        correlation_id: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
        data: {},
      });
      expect(envelope).toBeInstanceOf(EventEnvelope);
    });
  });
});
