/**
 * Gateway-level consumer option merge tests for RequestReplyConsumerService.
 *
 * Verifies that:
 * - gateway durableName is passed through on subscribe(subject)
 * - subscribe(subject, consumerOptsBuilder) passes builder through unchanged
 * - default (no gatewayConsumerOpts) produces ephemeral consumer default
 */
import { Test } from '@nestjs/testing';
import { consumerOpts } from 'nats';
import { RequestReplyConsumerService } from './request-reply-consumer.service';
import { REQUEST_REPLY_CONSUMER_DEPS_TOKEN } from './request-reply-consumer-deps.interface';
import { defaultDlqSubjectBuilder } from './subscribe-options.interface';
import { EventLoggerService } from '../logging/event-logger.service';

function extractDurableName(optsArg: unknown): string | undefined {
  const getOptsFn = (optsArg as { getOpts?: () => { config: Record<string, unknown> } }).getOpts;
  if (typeof getOptsFn === 'function') {
    return getOptsFn.call(optsArg).config.durable_name as string | undefined;
  }
  return (optsArg as { config?: Record<string, unknown> }).config?.durable_name as string | undefined;
}

describe('RequestReplyConsumerService — gateway consumer opts merge', () => {
  let jetStream: { subscribe: jest.Mock; publish: jest.Mock };
  let mockLogger: Record<string, jest.Mock>;

  function buildService(gatewayConsumerOpts: Record<string, unknown> | undefined): Promise<RequestReplyConsumerService> {
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
          provide: REQUEST_REPLY_CONSUMER_DEPS_TOKEN,
          useFactory: (logger: EventLoggerService) => ({
            jetStream,
            logger,
            dlqSubjectBuilder: defaultDlqSubjectBuilder,
            responseSubjectPattern: 'company.*.response.v1',
            ...(gatewayConsumerOpts !== undefined ? { gatewayConsumerOpts } : {}),
          }),
          inject: [EventLoggerService],
        },
        { provide: EventLoggerService, useValue: mockLogger },
        RequestReplyConsumerService,
      ],
    }).compile();

    return module.then((m) => m.get(RequestReplyConsumerService));
  }

  describe('with gatewayConsumerOpts { durableName: "rr-durable" }', () => {
    let service: RequestReplyConsumerService;

    beforeEach(async () => {
      service = await buildService({ durableName: 'rr-durable' });
    });

    it('passes gateway durable_name on subscribe(subject)', async () => {
      await service.subscribe('company.*.response.v1');
      const [, optsArg] = jetStream.subscribe.mock.calls[0] as [string, unknown];
      expect(extractDurableName(optsArg)).toBe('rr-durable');
    });

    it('subscribe(subject, builder) passes builder through unchanged', async () => {
      const builder = consumerOpts().durable('builder-durable').deliverTo('x').ackExplicit();
      await service.subscribe('company.*.custom.v1', builder);
      expect(jetStream.subscribe).toHaveBeenCalledWith('company.*.custom.v1', builder);
    });
  });

  describe('without gatewayConsumerOpts (current default)', () => {
    let service: RequestReplyConsumerService;

    beforeEach(async () => {
      service = await buildService(undefined);
    });

    it('produces ephemeral default consumer with no durable_name', async () => {
      await service.subscribe('company.*.response.v1');
      const [, optsArg] = jetStream.subscribe.mock.calls[0] as [string, unknown];
      expect(extractDurableName(optsArg)).toBeUndefined();
    });
  });
});
