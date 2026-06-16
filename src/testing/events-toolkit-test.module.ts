import { DynamicModule } from '@nestjs/common';
import { ProducerService } from '../producer/producer.service';
import { ConsumerService } from '../consumer/consumer.service';
import { OutboxService } from '../outbox/outbox.service';
import { RequestReplyService } from '../request-reply/request-reply.service';
import { EventLoggerService } from '../logging/event-logger.service';
import { MockProducerService } from './mock-producer.service';
import { MockConsumerService } from './mock-consumer.service';
import { MockEventLoggerService } from './mock-event-logger.service';
import { MockOutboxService } from './mock-outbox.service';
import { MockRequestReplyService } from './mock-request-reply.service';

/**
 * NestJS dynamic module that registers mock services for all events-toolkit subsystems.
 *
 * Uses `useExisting` to alias each mock as its real service token, so application
 * code receives mocks transparently without any import changes.
 *
 * @example
 * ```typescript
 * const module = await Test.createTestingModule({
 *   imports: [EventsToolkitTestModule.forRoot()],
 *   providers: [MyService],
 * }).compile();
 * ```
 */
export class EventsToolkitTestModule {
  /**
   * Creates a global dynamic module with all mock service providers.
   * @returns A `DynamicModule` that exports both mock and real service tokens.
   */
  static forRoot(): DynamicModule {
    return {
      module: EventsToolkitTestModule,
      global: true,
      providers: [
        MockProducerService,
        { provide: ProducerService, useExisting: MockProducerService },
        MockConsumerService,
        { provide: ConsumerService, useExisting: MockConsumerService },
        MockEventLoggerService,
        { provide: EventLoggerService, useExisting: MockEventLoggerService },
        MockOutboxService,
        { provide: OutboxService, useExisting: MockOutboxService },
        MockRequestReplyService,
        { provide: RequestReplyService, useExisting: MockRequestReplyService },
      ],
      exports: [
        MockProducerService,
        ProducerService,
        MockConsumerService,
        ConsumerService,
        MockEventLoggerService,
        EventLoggerService,
        MockOutboxService,
        OutboxService,
        MockRequestReplyService,
        RequestReplyService,
      ],
    };
  }
}
