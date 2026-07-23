/**
 * Gateway-level consumer option merge tests for JetStreamConsumerService.
 *
 * Builds the service with gatewayConsumerOpts and verifies that:
 * - gateway durableName is passed through to jetStream.subscribe
 * - per-subscription opts override gateway
 * - per-subscription builder fully overrides
 * - default (no gatewayConsumerOpts) still produces an ephemeral consumer
 */
import { Test } from '@nestjs/testing';
import { consumerOpts } from 'nats';
import { JetStreamConsumerService } from './jetstream-consumer.service';
import { ConsumerService } from './consumer.service';
import { EventLoggerService } from '../logging/event-logger.service';
import { JETSTREAM_CONSUMER_DEPS_TOKEN } from './jetstream-consumer-deps.interface';
import { defaultDlqSubjectBuilder } from './subscribe-options.interface';

function extractDurableName(optsArg: unknown): string | undefined {
  const getOptsFn = (optsArg as { getOpts?: () => { config: Record<string, unknown> } }).getOpts;
  if (typeof getOptsFn === 'function') {
    return getOptsFn.call(optsArg).config.durable_name as string | undefined;
  }
  return (optsArg as { config?: Record<string, unknown> }).config?.durable_name as string | undefined;
}

describe('JetStreamConsumerService — gateway consumer opts merge', () => {
  let jetStream: { subscribe: jest.Mock };
  let mockLogger: Record<string, jest.Mock>;

  function buildService(
    gatewayConsumerOpts: Record<string, unknown> | undefined,
  ): Promise<JetStreamConsumerService> {
    jetStream = { subscribe: jest.fn().mockResolvedValue((async function* () {})()), publish: jest.fn() };
    mockLogger = {
      logEventConsumed: jest.fn(),
      logEventError: jest.fn(),
      logEventDlq: jest.fn(),
      logEventEmitted: jest.fn(),
    };

    const module = Test.createTestingModule({
      providers: [
        {
          provide: JETSTREAM_CONSUMER_DEPS_TOKEN,
          useFactory: (cs: ConsumerService, logger: EventLoggerService) => ({
            jetStream,
            consumerService: cs,
            logger,
            dlqSubjectBuilder: defaultDlqSubjectBuilder,
            ...(gatewayConsumerOpts !== undefined ? { gatewayConsumerOpts } : {}),
          }),
          inject: [ConsumerService, EventLoggerService],
        },
        { provide: EventLoggerService, useValue: mockLogger },
        ConsumerService,
        JetStreamConsumerService,
      ],
    }).compile();

    return module.then((m) => m.get(JetStreamConsumerService));
  }

  describe('with gatewayConsumerOpts { durableName: "gateway-durable" }', () => {
    let service: JetStreamConsumerService;

    beforeEach(async () => {
      service = await buildService({ durableName: 'gateway-durable' });
    });

    it('passes gateway durable_name to jetStream.subscribe when no per-sub consumerOpts', async () => {
      await service.subscribe({ subject: 'company.*.test.v1', handler: jest.fn() });
      const [, optsArg] = jetStream.subscribe.mock.calls[0] as [string, unknown];
      const durableName = extractDurableName(optsArg);
      expect(durableName).toBe('gateway-durable');
    });

    it('per-subscription opts override gateway durable_name', async () => {
      await service.subscribe({
        subject: 'company.*.test.v1',
        handler: jest.fn(),
        consumerOpts: { config: { durable_name: 'per' } },
      });
      const [, optsArg] = jetStream.subscribe.mock.calls[0] as [string, unknown];
      const config = (optsArg as { config?: Record<string, unknown> }).config ?? {};
      expect(config.durable_name).toBe('per');
    });

    it('per-subscription ConsumerOptsBuilder bypasses gateway entirely', async () => {
      const builder = consumerOpts().durable('builder-durable').deliverTo('x').ackExplicit();
      await service.subscribe({
        subject: 'company.*.test.v1',
        handler: jest.fn(),
        consumerOpts: builder,
      });
      expect(jetStream.subscribe).toHaveBeenCalledWith('company.*.test.v1', builder);
    });
  });

  describe('without gatewayConsumerOpts (current default)', () => {
    let service: JetStreamConsumerService;

    beforeEach(async () => {
      service = await buildService(undefined);
    });

    it('produces ephemeral consumer with no durable_name', async () => {
      await service.subscribe({ subject: 'company.*.test.v1', handler: jest.fn() });
      const [, optsArg] = jetStream.subscribe.mock.calls[0] as [string, unknown];
      expect(extractDurableName(optsArg)).toBeUndefined();
    });
  });
});
