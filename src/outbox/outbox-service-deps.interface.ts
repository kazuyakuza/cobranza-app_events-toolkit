import { InjectionToken } from '@nestjs/common';
import { OutboxRepository } from './outbox.types';
import { ProducerService } from '../producer/producer.service';
import { EventLoggerService } from '../logging/event-logger.service';
import { OutboxServiceOptions } from './outbox-service-options.interface';

/** Injection token for OutboxService dependencies. */
export const OUTBOX_SERVICE_DEPS_TOKEN: InjectionToken = 'OUTBOX_SERVICE_DEPS';

/** Dependencies required by OutboxService. */
export interface OutboxServiceDeps {
  /** Persistence layer for outbox entries. */
  repository: OutboxRepository;
  /** NATS JetStream producer for publishing events. */
  producerService: ProducerService;
  /** Structured event logger. */
  logger: EventLoggerService;
  /** Optional processor configuration. */
  options?: OutboxServiceOptions;
}
