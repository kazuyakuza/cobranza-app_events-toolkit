import { Test } from '@nestjs/testing';
import { JetStreamClient, NatsConnection } from 'nats';
import { ProducerService, EmitOptions } from './producer.service';
import { EventContext } from '../common/envelope/event-context.interface';
import { JETSTREAM_TOKEN, ProducerModule } from './producer.module';
import { EventLoggerService, EventLogContext } from '../logging/event-logger.service';
import { EventEnvelope } from '../common/envelope/event-envelope.class';
import { ActorType } from '../common/envelope/actor-type.enum';
import { EmitEventInterceptor } from './decorators/emit-event-interceptor';

jest.mock('../common/utils/uuid.utils', () => ({
  generateEventId: jest.fn(() => 'evt_mock-uuid-1234'),
}));

jest.mock('../common/utils/date.utils', () => ({
  nowIso: jest.fn(() => '2026-06-13T15:00:00.000Z'),
}));

describe('ProducerService', () => {
  let service: ProducerService;
  let jetStream: Partial<JetStreamClient> & { publish: jest.Mock };
  let mockLoggerService: { logEventEmitted: jest.Mock; logEventError: jest.Mock };

  const sampleContext: EventContext = {
    type: 'payment.proof.uploaded',
    version: '1.0.0',
    producer: 'payment-service',
    companyId: '550e8400-e29b-41d4-a716-446655440000',
    actorType: ActorType.CLIENT,
    actorId: 'user-123',
    correlationId: '660e8400-e29b-41d4-a716-446655440001',
  };

  beforeEach(async () => {
    jetStream = { publish: jest.fn().mockResolvedValue({}) };
    mockLoggerService = { logEventEmitted: jest.fn(), logEventError: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        { provide: JETSTREAM_TOKEN, useValue: jetStream },
        { provide: EventLoggerService, useValue: mockLoggerService },
        ProducerService,
      ],
    }).compile();

    service = module.get(ProducerService);
  });

  describe('publish', () => {
    it('should publish encoded event to JetStream subject', async () => {
      const event = createTestEvent({ id: 'evt_test-123' });
      await service.publish('company.550e8400.payment.proof.uploaded.v1', event);

      expect(jetStream.publish).toHaveBeenCalledTimes(1);
      const [subject, payload] = jetStream.publish.mock.calls[0];
      expect(subject).toBe('company.550e8400.payment.proof.uploaded.v1');
      expect(payload).toBeInstanceOf(Uint8Array);

      const parsed = JSON.parse(new TextDecoder().decode(payload));
      expect(parsed.id).toBe('evt_test-123');
      expect(parsed.type).toBe('payment.proof.uploaded');
    });

    it('should log emitted event via EventLoggerService', async () => {
      const event = createTestEvent({ id: 'evt_test-456' });
      await service.publish('company.550e8400.payment.proof.uploaded.v1', event);

      expect(mockLoggerService.logEventEmitted).toHaveBeenCalledTimes(1);
      const loggedContext = mockLoggerService.logEventEmitted.mock.calls[0][0] as EventLogContext;
      expect(loggedContext.eventId).toBe('evt_test-456');
      expect(loggedContext.subject).toBe('company.550e8400.payment.proof.uploaded.v1');
    });

    it('should log and rethrow JetStream publish errors', async () => {
      const error = new Error('NATS publish failed');
      jetStream.publish.mockRejectedValue(error);

      const event = createTestEvent();
      await expect(service.publish('company.550e8400.payment.proof.uploaded.v1', event)).rejects.toThrow(error);

      expect(mockLoggerService.logEventError).toHaveBeenCalledTimes(1);
      expect(mockLoggerService.logEventEmitted).not.toHaveBeenCalled();

      const errorContext = mockLoggerService.logEventError.mock.calls[0][0];
      expect(errorContext.error).toBe('NATS publish failed');
      expect(errorContext.subject).toBe('company.550e8400.payment.proof.uploaded.v1');
    });
  });

  describe('emit', () => {
    const emitOptions: EmitOptions<{ amount: number }> = {
      subject: 'company.550e8400.payment.proof.uploaded.v1',
      data: { amount: 250 },
      context: sampleContext,
    };

    it('should build envelope with auto-generated id and produced_at', async () => {
      await service.emit(emitOptions);

      expect(jetStream.publish).toHaveBeenCalledTimes(1);
      const payload = jetStream.publish.mock.calls[0][1] as Uint8Array;
      const parsed = JSON.parse(new TextDecoder().decode(payload));
      expect(parsed.id).toBe('evt_mock-uuid-1234');
      expect(parsed.produced_at).toBe('2026-06-13T15:00:00.000Z');
    });

    it('should map EventContext fields to envelope', async () => {
      await service.emit(emitOptions);

      const payload = jetStream.publish.mock.calls[0][1] as Uint8Array;
      const parsed = JSON.parse(new TextDecoder().decode(payload));
      expect(parsed.type).toBe('payment.proof.uploaded');
      expect(parsed.version).toBe('1.0.0');
      expect(parsed.producer).toBe('payment-service');
      expect(parsed.company_id).toBe('550e8400-e29b-41d4-a716-446655440000');
      expect(parsed.actor_type).toBe('client');
      expect(parsed.actor_id).toBe('user-123');
      expect(parsed.correlation_id).toBe('660e8400-e29b-41d4-a716-446655440001');
      expect(parsed.data).toEqual({ amount: 250 });
    });

    it('should include optional context fields in envelope', async () => {
      const optionsWithOptionals: EmitOptions<{ amount: number }> = {
        subject: 'company.550e8400.payment.proof.uploaded.v1',
        data: { amount: 300 },
        context: {
          ...sampleContext,
          causationId: '770e8400-e29b-41d4-a716-446655440002',
          traceId: 'trace-abc-123',
          replyTo: 'reply.subject',
        },
      };

      await service.emit(optionsWithOptionals);

      const payload = jetStream.publish.mock.calls[0][1] as Uint8Array;
      const parsed = JSON.parse(new TextDecoder().decode(payload));
      expect(parsed.causation_id).toBe('770e8400-e29b-41d4-a716-446655440002');
      expect(parsed.trace_id).toBe('trace-abc-123');
      expect(parsed.reply_to).toBe('reply.subject');
    });

    it('should log emitted event via EventLoggerService', async () => {
      await service.emit(emitOptions);

      expect(mockLoggerService.logEventEmitted).toHaveBeenCalledTimes(1);
      const loggedContext = mockLoggerService.logEventEmitted.mock.calls[0][0] as EventLogContext;
      expect(loggedContext.eventId).toBe('evt_mock-uuid-1234');
      expect(loggedContext.eventType).toBe('payment.proof.uploaded');
    });
  });

  describe('ProducerModule', () => {
    it('should resolve JetStream from connection via forRoot', () => {
      const mockConnection: Partial<NatsConnection> & { jetstream: jest.Mock } = {
        jetstream: jest.fn().mockReturnValue(jetStream),
      };
      const dynamicModule = ProducerModule.forRoot({
        connection: mockConnection as NatsConnection,
      });
      expect(mockConnection.jetstream).toHaveBeenCalledTimes(1);
      expect(dynamicModule.exports).toContain(ProducerService);
      expect(dynamicModule.exports).toContain(EmitEventInterceptor);
    });

    it('should use provided jetStream directly via forRoot', () => {
      const dynamicModule = ProducerModule.forRoot({
        jetStream: jetStream as JetStreamClient,
      });
      expect(dynamicModule.exports).toContain(ProducerService);
      expect(dynamicModule.exports).toContain(EmitEventInterceptor);
    });

    it('should throw if neither connection nor jetStream is provided', () => {
      expect(() => ProducerModule.forRoot({})).toThrow(
        'ProducerModule requires either connection or jetStream in options',
      );
    });

    it('should resolve JetStream from async factory via forRootAsync', async () => {
      const dynamicModule = ProducerModule.forRootAsync({
        useFactory: async () => ({ jetStream: jetStream as JetStreamClient }),
      });

      const jetStreamProvider = dynamicModule.providers?.find(
        (p) => 'provide' in p && p.provide === JETSTREAM_TOKEN,
      ) as { useFactory: () => Promise<JetStreamClient> };
      const resolved = await jetStreamProvider.useFactory();
      expect(resolved).toBe(jetStream);
    });

    it('should pass inject dependencies to async factory via forRootAsync', () => {
      const injectToken = 'TEST_TOKEN';
      const dynamicModule = ProducerModule.forRootAsync({
        useFactory: async () => ({ jetStream: jetStream as JetStreamClient }),
        inject: [injectToken],
      });

      const jetStreamProvider = dynamicModule.providers?.find(
        (p) => 'provide' in p && p.provide === JETSTREAM_TOKEN,
      ) as { provide: string; inject: unknown[] };
      expect(jetStreamProvider.inject).toContain(injectToken);
    });
  });
});

function createTestEvent(
  overrides: Partial<EventEnvelope<{ amount: number }>> = {},
): EventEnvelope<{ amount: number }> {
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
