import { Test } from '@nestjs/testing';
import { JetStreamClient } from 'nats';
import { ProducerService, EmitGlobalOptions } from './producer.service';
import { GlobalEventContext } from '../common/envelope/global-event-context.interface';
import { ProducerModule } from './producer.module';
import { JETSTREAM_TOKEN } from './producer.constants';
import { EventLoggerService } from '../logging/event-logger.service';
import { GlobalEventEnvelope } from '../common/envelope/global-event-envelope.class';
import { ActorType } from '../common/envelope/actor-type.enum';

jest.mock('../common/utils/uuid.utils', () => ({
  generateEventId: jest.fn(() => 'evt_mock-uuid-1234'),
}));

jest.mock('../common/utils/date.utils', () => ({
  nowIso: jest.fn(() => '2026-06-13T15:00:00.000Z'),
}));

describe('ProducerService — global events', () => {
  let service: ProducerService;
  let jetStream: Partial<JetStreamClient> & { publish: jest.Mock };
  let mockLoggerService: { logEventEmitted: jest.Mock; logEventError: jest.Mock };

  const globalContext: GlobalEventContext = {
    type: 'iam.company.created',
    version: '1.0.0',
    producer: 'iam-service',
    actorType: ActorType.SYSTEM,
    correlationId: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
  };

  beforeEach(async () => {
    jetStream = { publish: jest.fn().mockResolvedValue(undefined) };
    mockLoggerService = { logEventEmitted: jest.fn(), logEventError: jest.fn() };

    const module = await Test.createTestingModule({
      imports: [ProducerModule],
      overrideProviders: [
        { provide: JETSTREAM_TOKEN, useValue: jetStream },
        { provide: EventLoggerService, useValue: mockLoggerService },
      ],
    })
      .overrideProvider(ProducerService)
      .useFactory({
        factory: () => new ProducerService(jetStream as unknown as JetStreamClient, mockLoggerService as unknown as EventLoggerService),
      })
      .compile();

    service = module.get(ProducerService);
  });

  describe('emitGlobal', () => {
    it('publishes a GlobalEventEnvelope to the correct subject', async () => {
      const options: EmitGlobalOptions<{ name: string }> = {
        subject: 'global.iam.company.created.v1',
        data: { name: 'Acme Corp' },
        context: globalContext,
      };

      await service.emitGlobal(options);

      expect(jetStream.publish).toHaveBeenCalledWith(
        'global.iam.company.created.v1',
        expect.any(Uint8Array),
      );
    });

    it('published payload omits company_id', async () => {
      const options: EmitGlobalOptions<{ name: string }> = {
        subject: 'global.iam.company.created.v1',
        data: { name: 'Acme Corp' },
        context: globalContext,
      };

      await service.emitGlobal(options);

      const payloadBytes = jetStream.publish.mock.calls[0][1] as Uint8Array;
      const decoded = JSON.parse(new TextDecoder().decode(payloadBytes));
      expect(decoded.company_id).toBeUndefined();
    });

    it('logs event emission with correct context', async () => {
      const options: EmitGlobalOptions<{ name: string }> = {
        subject: 'global.iam.company.created.v1',
        data: { name: 'Acme Corp' },
        context: globalContext,
      };

      await service.emitGlobal(options);

      expect(mockLoggerService.logEventEmitted).toHaveBeenCalledWith({
        eventId: 'evt_mock-uuid-1234',
        eventType: 'iam.company.created',
        subject: 'global.iam.company.created.v1',
        correlationId: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
        traceId: undefined,
      });
    });
  });

  describe('publish with GlobalEventEnvelope', () => {
    it('accepts a GlobalEventEnvelope directly', async () => {
      const globalEvent = new GlobalEventEnvelope({
        id: 'evt_global-test',
        type: 'iam.company.created',
        version: '1.0.0',
        produced_at: '2026-06-13T15:00:00.000Z',
        producer: 'iam-service',
        actor_type: ActorType.SYSTEM,
        correlation_id: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
        data: { name: 'Acme Corp' },
      });

      await service.publish('global.iam.company.created.v1', globalEvent);

      expect(jetStream.publish).toHaveBeenCalledTimes(1);
    });
  });
});
