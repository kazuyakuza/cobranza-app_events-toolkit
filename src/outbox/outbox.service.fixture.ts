import { OutboxService } from './outbox.service';
import { EventEnvelope } from '../common/envelope/event-envelope.class';
import { ActorType } from '../common/envelope/actor-type.enum';
import { OutboxEntry, OutboxRepository } from './outbox.types';

export function createTestEnvelope(): EventEnvelope<unknown> {
  return new EventEnvelope<unknown>({
    id: 'evt_01929390-7abc-7123-8def-0123456789ab',
    type: 'payment.proof.uploaded',
    version: '1.0.0',
    produced_at: '2026-01-15T10:30:00.000Z',
    producer: 'payment-service',
    company_id: '550e8400-e29b-41d4-a716-446655440000',
    actor_type: ActorType.SYSTEM,
    actor_id: 'user-123',
    correlation_id: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
    data: { amount: 100 },
  });
}

export function createTestEntry(overrides?: Partial<OutboxEntry>): OutboxEntry {
  return {
    id: 'evt_01929390-7abc-7123-8def-0123456789ab',
    eventData: JSON.stringify(createTestEnvelope()),
    subject: 'company.550e8400e29b41d4a716446655440000.payment.proof.uploaded.v1',
    metadata: null,
    status: 'pending',
    attempts: 0,
    lastError: null,
    createdAt: '2026-01-15T10:30:00.000Z',
    updatedAt: '2026-01-15T10:30:00.000Z',
    ...overrides,
  };
}

export interface OutboxMocks {
  repository: jest.Mocked<OutboxRepository>;
  producerService: { publish: jest.Mock };
  logger: {
    logOutboxSaved: jest.Mock;
    logOutboxProcessed: jest.Mock;
    logOutboxFailed: jest.Mock;
    logOutboxDlq: jest.Mock;
    logEventError: jest.Mock;
  };
}

export function createOutboxMocks(): OutboxMocks {
  return {
    repository: {
      save: jest.fn(),
      getPending: jest.fn(),
      markAsSent: jest.fn(),
      markAsFailed: jest.fn(),
    },
    producerService: {
      publish: jest.fn(),
    },
    logger: {
      logOutboxSaved: jest.fn(),
      logOutboxProcessed: jest.fn(),
      logOutboxFailed: jest.fn(),
      logOutboxDlq: jest.fn(),
      logEventError: jest.fn(),
    },
  };
}

export function createService(mocks: OutboxMocks, options?: Record<string, unknown>): OutboxService {
  return new OutboxService({
    repository: mocks.repository,
    producerService: mocks.producerService as never,
    logger: mocks.logger as never,
    options: options as never,
  });
}

export function resetMocks(mocks: OutboxMocks): void {
  jest.clearAllMocks();
  mocks.repository.save.mockResolvedValue(undefined);
  mocks.repository.getPending.mockResolvedValue([]);
  mocks.repository.markAsSent.mockResolvedValue(undefined);
  mocks.repository.markAsFailed.mockResolvedValue(undefined);
}
